using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>Kiểm tra, tính giá và giữ chỗ thuê sân của Member trên sổ occupancy chung. Rental chỉ chiếm phòng, không chiếm Coach.</summary>
public sealed partial class CourtRentalService(ISportHubDbContext db, IUserAccessReader users,
    ISportCatalogReader catalog, IOccupancyService occupancy, ISystemSettingProvider settings,
    IClock clock) : ICourtRentalFulfillment
{
    public async Task<CourtRentalQuote> QuoteAsync(CourtRentalRequest request, CancellationToken cancellationToken = default)
    {
        var slotMinutes = await settings.GetIntAsync(SystemSettingKeys.RentalSlotMinutes, cancellationToken);
        var maxHours = await settings.GetIntAsync(SystemSettingKeys.RentalMaxHours, cancellationToken);
        var advanceDays = await settings.GetIntAsync(SystemSettingKeys.RentalAdvanceDays, cancellationToken);
        ValidateWindow(request, slotMinutes, maxHours, advanceDays);
        // Mọi Member đang hoạt động đều thuê được sân: không cần Membership Gym, chuyên môn hay duyệt.
        var access = await users.GetAsync(request.MemberId, cancellationToken);
        if (access is null || !access.IsActive || access.Role != "Member")
            throw new ForbiddenException("member_inactive", "Chỉ Member đang hoạt động mới được thuê sân.");

        // Môn phải đang hoạt động và dịch vụ thuê sân đang bật; không whitelist theo tên hay ID môn.
        if (!await catalog.IsServiceEnabledAsync(request.SportId, SportServiceType.CourtRental, cancellationToken))
            throw new BadRequestException("rental_not_available", "Môn này không cho thuê sân hoặc đã ngừng hoạt động.");
        var room = await (from r in db.Set<Room>().AsNoTracking()
                          join link in db.Set<SportRoomType>().AsNoTracking() on r.RoomTypeId equals link.RoomTypeId
                          where r.RoomId == request.RoomId && r.IsActive && link.SportId == request.SportId
                          select r).SingleOrDefaultAsync(cancellationToken)
            ?? throw new ConflictException("rental_room_incompatible", "Sân không hoạt động hoặc không phù hợp môn.");
        if (room.RoomTypeId is not int roomTypeId)
            throw new ConflictException("rental_room_unclassified", "Sân chưa được phân loại để thuê.");

        var startLocal = VietnamTime.ToLocal(request.StartUtc.UtcDateTime);
        var endLocal = VietnamTime.ToLocal(request.EndUtc.UtcDateTime);
        if (startLocal.Date != endLocal.Date)
            throw new BadRequestException("rental_cross_day", "Một lượt thuê phải nằm trong cùng ngày địa phương.");
        var opening = await db.Set<RoomOpeningHour>().AsNoTracking().SingleOrDefaultAsync(x => x.RoomId == room.RoomId
            && x.DayOfWeek == (int)startLocal.DayOfWeek, cancellationToken);
        if (!RoomOpeningHourService.Covers(opening, startLocal, endLocal))
            throw new ConflictException("rental_outside_opening_hours", "Thời gian thuê nằm ngoài giờ mở cửa của sân.");

        var rates = await db.Set<CourtRate>().AsNoTracking().Where(x => x.IsActive && x.RoomTypeId == roomTypeId
            && (x.SportId == null || x.SportId == request.SportId)).ToListAsync(cancellationToken);
        return CourtRateCalculator.Calculate(rates, request.SportId, request.StartUtc,
            request.EndUtc - request.StartUtc, slotMinutes);
    }

    public async Task<Guid> ReserveAsync(Guid invoiceId, CourtRentalRequest request, DateTimeOffset holdExpiresAtUtc,
        CourtRentalQuote quotedPrice, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        if (holdExpiresAtUtc <= clock.UtcNow || holdExpiresAtUtc > request.StartUtc)
            throw new ConflictException("rental_hold_window_invalid", "Hạn checkout phải trước giờ thuê.");
        var quote = await QuoteAsync(request, cancellationToken);
        if (quote.TotalPrice != quotedPrice.TotalPrice || !quote.Blocks.SequenceEqual(quotedPrice.Blocks))
            throw new ConflictException("rental_price_changed", "Bảng giá đã đổi trong lúc đặt sân; hãy xác nhận lại báo giá.");
        var id = Guid.NewGuid();
        var result = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.CourtRental, id,
            request.RoomId, null, request.StartUtc, request.EndUtc), cancellationToken);
        if (!result.Succeeded) throw new OccupancyConflictException(result.Conflicts);
        db.Set<CourtRental>().Add(new CourtRental
        {
            CourtRentalId = id, MemberId = request.MemberId, SportId = request.SportId,
            RoomId = request.RoomId, StartAtUtc = request.StartUtc.UtcDateTime, EndAtUtc = request.EndUtc.UtcDateTime,
            TotalPrice = quote.TotalPrice,
            PriceSnapshotJson = JsonSerializer.Serialize(quote.Blocks), Status = CourtRentalStatus.PendingPayment,
            CreatedAtUtc = clock.UtcNow, InvoiceId = invoiceId
        });
        await db.SaveChangesAsync(cancellationToken);
        return id;
    }

    public async Task ConfirmAsync(Guid courtRentalId, Guid invoiceItemId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var rental = await LockAsync(courtRentalId, cancellationToken);
        if (rental.Status == CourtRentalStatus.Confirmed)
        {
            if (rental.InvoiceItemId == invoiceItemId) return;
            throw new ConflictException("rental_fulfillment_conflict", "Lượt thuê đã được xác nhận bằng hóa đơn khác.");
        }
        if (rental.Status != CourtRentalStatus.PendingPayment || rental.StartAtUtc <= clock.UtcNow)
            throw new ConflictException("rental_no_longer_valid", "Lượt thuê đã hủy hoặc đã bắt đầu.");
        rental.Status = CourtRentalStatus.Confirmed;
        rental.InvoiceItemId = invoiceItemId;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ReleaseAsync(Guid courtRentalId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var rental = await LockAsync(courtRentalId, cancellationToken);
        if (rental.Status != CourtRentalStatus.PendingPayment) return;
        rental.Status = CourtRentalStatus.Cancelled;
        rental.CancelledAtUtc = clock.UtcNow;
        rental.CancelReason = "Checkout hết hạn hoặc bị hủy";
        await occupancy.ReleaseAsync(OccupancySources.CourtRental, courtRentalId, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task CancelAsync(Guid courtRentalId, string reason, bool centerFault = false,
        Guid? incidentId = null, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var rental = await LockAsync(courtRentalId, cancellationToken);
        if (rental.Status == CourtRentalStatus.Cancelled) return;
        if (!centerFault && (rental.Status is CourtRentalStatus.Completed || rental.StartAtUtc <= clock.UtcNow))
            throw new ConflictException("rental_already_started", "Không thể hủy lượt thuê đã bắt đầu.");
        rental.Status = CourtRentalStatus.Cancelled;
        rental.CancelledAtUtc = clock.UtcNow;
        rental.CancellationIncidentId = incidentId;
        var cleanReason = string.IsNullOrWhiteSpace(reason) ? "Cancelled" : reason.Trim();
        rental.CancelReason = (centerFault ? "CenterFault:" : string.Empty)
            + cleanReason[..Math.Min(cleanReason.Length, centerFault ? 486 : 500)];
        await occupancy.ReleaseAsync(OccupancySources.CourtRental, courtRentalId, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<CourtRentalRequest> GetForRetryAsync(Guid courtRentalId, CancellationToken cancellationToken = default)
    {
        var row = await db.Set<CourtRental>().AsNoTracking().SingleOrDefaultAsync(x => x.CourtRentalId == courtRentalId, cancellationToken)
            ?? throw new NotFoundException("rental_not_found", "Không tìm thấy lượt thuê sân.");
        return new CourtRentalRequest(row.MemberId, row.SportId, row.RoomId,
            new DateTimeOffset(DateTime.SpecifyKind(row.StartAtUtc, DateTimeKind.Utc)),
            new DateTimeOffset(DateTime.SpecifyKind(row.EndAtUtc, DateTimeKind.Utc)));
    }

    public async Task<CourtRentalRefundFacts?> GetRefundFactsAsync(Guid invoiceItemId, CancellationToken cancellationToken = default)
    {
        var row = await db.Set<CourtRental>().AsNoTracking().SingleOrDefaultAsync(x => x.InvoiceItemId == invoiceItemId, cancellationToken);
        return row is null ? null : new CourtRentalRefundFacts(row.CourtRentalId, row.MemberId,
            new DateTimeOffset(DateTime.SpecifyKind(row.StartAtUtc, DateTimeKind.Utc)), row.Status.ToString(),
            row.Status == CourtRentalStatus.Cancelled && row.CancelReason?.StartsWith("CenterFault:", StringComparison.Ordinal) == true);
    }

    public async Task<int> CompleteDueAsync(CancellationToken cancellationToken = default)
    {
        var ids = await db.Set<CourtRental>().AsNoTracking().Where(x => x.Status == CourtRentalStatus.Confirmed
                && x.EndAtUtc <= clock.UtcNow).OrderBy(x => x.EndAtUtc).Select(x => x.CourtRentalId)
            .Take(100).ToListAsync(cancellationToken);
        var count = 0;
        foreach (var id in ids)
        {
            await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
            var rental = await LockAsync(id, cancellationToken);
            if (rental.Status != CourtRentalStatus.Confirmed || rental.EndAtUtc > clock.UtcNow)
            {
                await tx.RollbackAsync(cancellationToken);
                continue;
            }
            rental.Status = CourtRentalStatus.Completed;
            await occupancy.ReleaseAsync(OccupancySources.CourtRental, id, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            count++;
        }
        return count;
    }

    public async Task<bool> ReacquireForLatePaymentAsync(Guid courtRentalId, DateTimeOffset newHoldExpiresAtUtc,
        CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var rental = await LockAsync(courtRentalId, cancellationToken);
        if (rental.Status != CourtRentalStatus.Cancelled || rental.StartAtUtc <= clock.UtcNow
            || rental.EndAtUtc <= clock.UtcNow || newHoldExpiresAtUtc <= clock.UtcNow
            || newHoldExpiresAtUtc.UtcDateTime >= rental.StartAtUtc)
            return false;
        var room = await db.Set<Room>().AsNoTracking().SingleOrDefaultAsync(x => x.RoomId == rental.RoomId, cancellationToken);
        var sportActive = await db.Set<Sport>().AsNoTracking().AnyAsync(x => x.SportId == rental.SportId && x.IsActive, cancellationToken);
        if (room is null || !room.IsActive || !sportActive) return false;
        var result = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.CourtRental, courtRentalId,
            rental.RoomId, null,
            new DateTimeOffset(DateTime.SpecifyKind(rental.StartAtUtc, DateTimeKind.Utc)),
            new DateTimeOffset(DateTime.SpecifyKind(rental.EndAtUtc, DateTimeKind.Utc))), cancellationToken);
        if (!result.Succeeded) return false;
        rental.Status = CourtRentalStatus.PendingPayment;
        rental.CancelledAtUtc = null;
        rental.CancelReason = null;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<CourtRental> LockAsync(Guid id, CancellationToken ct)
        => (await db.Set<CourtRental>().FromSqlInterpolated($"SELECT * FROM court_rentals WHERE court_rental_id = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct)) ?? throw new NotFoundException("rental_not_found", "Không tìm thấy lượt thuê sân.");

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Court rental changes require caller transaction.");
    }

    private void ValidateWindow(CourtRentalRequest request, int slotMinutes, int maxHours, int advanceDays)
    {
        if (request.MemberId == Guid.Empty || request.SportId <= 0 || request.RoomId <= 0
            || request.StartUtc.Offset != TimeSpan.Zero || request.EndUtc.Offset != TimeSpan.Zero)
            throw new BadRequestException("invalid_rental_request", "Thông tin sân thuê không hợp lệ.");
        var duration = request.EndUtc - request.StartUtc;
        if (slotMinutes is not (30 or 60) || maxHours is < 1 or > 4 || advanceDays is < 1 or > 30
            || request.StartUtc <= clock.UtcNow || request.StartUtc > clock.UtcNow.AddDays(advanceDays)
            || duration < TimeSpan.FromHours(1) || duration > TimeSpan.FromHours(maxHours)
            || duration.TotalMinutes % slotMinutes != 0 || request.StartUtc.Minute % slotMinutes != 0
            || request.StartUtc.Second != 0 || request.StartUtc.Millisecond != 0)
            throw new BadRequestException("invalid_rental_window", $"Lượt thuê phải bắt đầu trong {advanceDays} ngày, theo khối {slotMinutes} phút và kéo dài 1–{maxHours} giờ.");
    }
}
