using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed class CourtRentalOperationsService(ISportHubDbContext db,
    ICourtRentalFulfillment rentals, IRefundCreditService refunds, ISystemSettingProvider settings, IClock clock)
{
    public async Task<IReadOnlyList<CourtRentalSummary>> MineAsync(Guid ownerId, DateTime fromUtc, DateTime toUtc,
        CancellationToken ct = default)
    {
        ValidateRange(fromUtc, toUtc);
        return await db.Set<CourtRental>().AsNoTracking().Where(x => x.ExternalCoachId == ownerId
                && x.StartAtUtc < toUtc && x.EndAtUtc > fromUtc)
            .OrderBy(x => x.StartAtUtc).Select(Project()).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<CourtRentalSummary>> StaffScheduleAsync(int? roomId, DateTime fromUtc,
        DateTime toUtc, CancellationToken ct = default)
    {
        ValidateRange(fromUtc, toUtc);
        var query = db.Set<CourtRental>().AsNoTracking().Where(x => x.StartAtUtc < toUtc && x.EndAtUtc > fromUtc);
        if (roomId is int id) query = query.Where(x => x.RoomId == id);
        return await query.OrderBy(x => x.StartAtUtc).Select(Project()).ToListAsync(ct);
    }

    public async Task CancelByOwnerAsync(Guid rentalId, Guid ownerId, CancellationToken ct = default)
        => await CancelAsync(rentalId, ownerId, false, "Hủy bởi ExternalCoach", ct);

    public async Task CancelByCenterAsync(Guid rentalId, Guid managerId, string reason, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("rental_cancel_reason_required", "Cần ghi lý do hủy (3–500 ký tự).");
        await CancelAsync(rentalId, managerId, true, reason.Trim(), ct);
    }

    private async Task CancelAsync(Guid rentalId, Guid actorId, bool centerFault, string reason, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var reference = await db.Set<CourtRental>().AsNoTracking().SingleOrDefaultAsync(x => x.CourtRentalId == rentalId, ct)
            ?? throw new NotFoundException("rental_not_found", "Không tìm thấy lượt thuê sân.");
        if (!centerFault && reference.ExternalCoachId != actorId)
            throw new ForbiddenException("rental_not_owned", "Lượt thuê không thuộc tài khoản này.");
        if (reference.Status == CourtRentalStatus.Confirmed && reference.InvoiceItemId is Guid referencedItem)
            await refunds.LockPaidItemAsync(referencedItem, ct);
        var rental = await db.Set<CourtRental>().FromSqlInterpolated(
                $"SELECT * FROM court_rentals WHERE court_rental_id = {rentalId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("rental_not_found", "Không tìm thấy lượt thuê sân.");
        if (reference.InvoiceItemId != rental.InvoiceItemId)
            throw new ConflictException("rental_item_changed", "Hóa đơn thuê sân vừa thay đổi; hãy thử lại.");
        if (rental.Status != CourtRentalStatus.Confirmed || rental.InvoiceItemId is not Guid itemId)
            throw new ConflictException("rental_not_cancellable", "Chỉ lượt thuê đã thanh toán và còn hiệu lực mới hủy được.");
        if (!centerFault && rental.StartAtUtc <= clock.UtcNow)
            throw new ConflictException("rental_already_started", "Không thể tự hủy lượt thuê đã bắt đầu.");

        var freeCancelHours = await settings.GetIntAsync(SystemSettingKeys.RentalCancelFreeHours, ct);
        if (centerFault || rental.StartAtUtc - clock.UtcNow >= TimeSpan.FromHours(freeCancelHours))
        {
            await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                centerFault ? $"CenterFault:{reason}" : reason, rental.CourtRentalId), ct);
        }
        await rentals.CancelAsync(rentalId, reason, centerFault, cancellationToken: ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private static System.Linq.Expressions.Expression<Func<CourtRental, CourtRentalSummary>> Project()
        => x => new CourtRentalSummary(x.CourtRentalId, x.SportId, x.RoomId, x.StartAtUtc,
            x.EndAtUtc, x.ExpectedAttendees, x.TotalPrice, x.Status.ToString(), x.InvoiceItemId);

    private static void ValidateRange(DateTime fromUtc, DateTime toUtc)
    {
        if (toUtc <= fromUtc || toUtc - fromUtc > TimeSpan.FromDays(31))
            throw new BadRequestException("invalid_range", "Khoảng lịch phải dương và tối đa 31 ngày.");
    }
}

public sealed record CourtRentalSummary(Guid CourtRentalId, int SportId, int RoomId,
    DateTime StartAtUtc, DateTime EndAtUtc, int ExpectedAttendees, decimal TotalPrice,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status, Guid? InvoiceItemId);
