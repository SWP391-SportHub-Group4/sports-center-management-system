using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Scheduling.Catalog.Domain;
using System.Text.Json;

namespace SportHub.Scheduling.Rental.Application;

public sealed class CourtRentalOperationsService(ISportHubDbContext db,
    ICourtRentalFulfillment rentals, IRefundCreditService refunds, ISystemSettingProvider settings, IClock clock)
{
    public async Task<CourtRentalPolicy> PolicyAsync(CancellationToken ct = default)
        => new(await settings.GetIntAsync(SystemSettingKeys.RentalSlotMinutes, ct),
            await settings.GetIntAsync(SystemSettingKeys.RentalMaxHours, ct),
            await settings.GetIntAsync(SystemSettingKeys.RentalAdvanceDays, ct),
            await settings.GetIntAsync(SystemSettingKeys.RentalCancelFreeHours, ct), clock.UtcNow);

    public async Task<CourtRentalDetail> GetMineAsync(Guid rentalId, Guid ownerId, CancellationToken ct = default)
    {
        var row = await db.Set<CourtRental>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.CourtRentalId == rentalId && x.MemberId == ownerId, ct)
            ?? throw new NotFoundException("rental_not_found", "Rental not found.");
        var summary = await db.Set<CourtRental>().AsNoTracking().Where(x => x.CourtRentalId == rentalId)
            .Select(Project()).SingleAsync(ct);
        var roomName = await db.Set<Room>().Where(x => x.RoomId == row.RoomId).Select(x => x.Name).SingleAsync(ct);
        var sportName = await db.Set<Sport>().Where(x => x.SportId == row.SportId).Select(x => x.Name).SingleAsync(ct);
        var points = row.InvoiceItemId is Guid itemId ? await refunds.GetSystemRefundPointsAsync(itemId, ct) : 0;
        return new CourtRentalDetail(summary, roomName, sportName,
            JsonSerializer.Deserialize<List<CourtRentalBlockPrice>>(row.PriceSnapshotJson) ?? [],
            row.CancelReason?.StartsWith("CenterFault:", StringComparison.Ordinal) == true
                ? row.CancelReason["CenterFault:".Length..] : row.CancelReason, row.CancelledAtUtc, points);
    }
    public async Task<IReadOnlyList<CourtRentalSummary>> MineAsync(Guid ownerId, DateTime fromUtc, DateTime toUtc,
        CancellationToken ct = default)
    {
        ValidateRange(fromUtc, toUtc);
        return await db.Set<CourtRental>().AsNoTracking().Where(x => x.MemberId == ownerId
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
        => await CancelAsync(rentalId, ownerId, false, "Canceled by member", ct);

    public async Task CancelOnBehalfAsync(Guid rentalId, CancellationToken ct = default)
    {
        var ownerId = await db.Set<CourtRental>().AsNoTracking()
            .Where(x => x.CourtRentalId == rentalId).Select(x => (Guid?)x.MemberId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("rental_not_found", "Rental not found.");
        await CancelAsync(rentalId, ownerId, false, "Canceled at front desk", ct);
    }

    public async Task CancelByCenterAsync(Guid rentalId, Guid managerId, string reason, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("rental_cancel_reason_required", "Rental cancel reason required.");
        await CancelAsync(rentalId, managerId, true, reason.Trim(), ct);
    }

    private async Task CancelAsync(Guid rentalId, Guid actorId, bool centerFault, string reason, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var reference = await db.Set<CourtRental>().AsNoTracking().SingleOrDefaultAsync(x => x.CourtRentalId == rentalId, ct)
            ?? throw new NotFoundException("rental_not_found", "Rental not found.");
        if (!centerFault && reference.MemberId != actorId)
            throw new ForbiddenException("rental_not_owned", "Rental not owned.");
        if ((reference.Status == CourtRentalStatus.Confirmed ||
             centerFault && reference.Status == CourtRentalStatus.InUse)
            && reference.InvoiceItemId is Guid referencedItem)
            await refunds.LockPaidItemAsync(referencedItem, ct);
        var rental = await db.Set<CourtRental>().FromSqlInterpolated(
                $"SELECT * FROM court_rentals WHERE court_rental_id = {rentalId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("rental_not_found", "Rental not found.");
        if (reference.InvoiceItemId != rental.InvoiceItemId)
            throw new ConflictException("rental_item_changed", "Rental item changed.");
        if ((rental.Status != CourtRentalStatus.Confirmed &&
             !(centerFault && rental.Status == CourtRentalStatus.InUse)) || rental.InvoiceItemId is not Guid itemId)
            throw new ConflictException("rental_not_cancellable", "Rental not cancellable.");
        if (!centerFault && rental.StartAtUtc <= clock.UtcNow)
            throw new ConflictException("rental_already_started", "Rental already started.");

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
            x.EndAtUtc, x.TotalPrice, x.Status.ToString(), x.InvoiceItemId) { InvoiceId = x.InvoiceId };

    private static void ValidateRange(DateTime fromUtc, DateTime toUtc)
    {
        if (toUtc <= fromUtc || toUtc - fromUtc > TimeSpan.FromDays(31))
            throw new BadRequestException("invalid_range", "Invalid range.");
    }
}

public sealed record CourtRentalSummary(Guid CourtRentalId, int SportId, int RoomId,
    DateTime StartAtUtc, DateTime EndAtUtc, decimal TotalPrice,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status, Guid? InvoiceItemId)
{
    public Guid? InvoiceId { get; init; }
}
public sealed record CourtRentalPolicy(int SlotMinutes, int MaxHours, int AdvanceDays, int CancelFreeHours, DateTime ServerNowUtc);
public sealed record CourtRentalDetail(CourtRentalSummary Rental, string RoomName, string SportName,
    IReadOnlyList<CourtRentalBlockPrice> Blocks, string? CancelReason, DateTime? CancelledAtUtc, int RefundPoints);
