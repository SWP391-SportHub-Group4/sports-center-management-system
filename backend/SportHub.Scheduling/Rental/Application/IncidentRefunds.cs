using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed partial class IncidentService
{
    private static string Fingerprint(object value)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value))));

    private async Task<List<IncidentRefundRow>> RefundRowsAsync(IncidentShape shape, CancellationToken ct)
    {
        var rows = new List<IncidentRefundRow>();
        var rentalRows = await (from rental in db.Set<CourtRental>().AsNoTracking()
            join room in db.Set<Room>().AsNoTracking() on rental.RoomId equals room.RoomId
            where shape.RoomIds.Contains(rental.RoomId) && rental.StartAtUtc < shape.EndUtc && rental.EndAtUtc > shape.StartUtc
                && (rental.Status != CourtRentalStatus.Cancelled || rental.CancellationIncidentId != null)
            select new { Rental = rental, RoomName = room.Name }).ToListAsync(ct);
        foreach (var entry in rentalRows)
        {
            var rental = entry.Rental;
            var balance = rental.InvoiceItemId is Guid item
                ? await refunds.GetItemBalanceAsync(item, ct)
                : new RefundItemBalance(rental.InvoiceId ?? Guid.Empty, false, 0, 0);
            rows.Add(new(rental.CourtRentalId, "CourtRental", rental.MemberId,
                (await users.GetAsync(rental.MemberId, ct))?.FullName, entry.RoomName, rental.StartAtUtc, rental.EndAtUtc,
                rental.Status.ToString(), balance.IsPaid, balance.RemainingPoints, balance.RefundedPoints,
                balance.RemainingPoints, rental.InvoiceItemId, balance.InvoiceId));
        }
        // Day passes give access to all Gym rooms. A room-scoped incident affects them only when
        // every active Gym room is unavailable, not when another Gym room remains usable.
        if (await ClosesGymAsync(shape, ct))
        {
            var from = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
            var to = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.EndUtc.AddTicks(-1)));
            foreach (var pass in await dayPasses.FindAsync(from, to, ct))
            {
                var start = VietnamTime.StartOfDayUtc(pass.UseDate).AddHours(6);
                var end = VietnamTime.StartOfDayUtc(pass.UseDate).AddHours(22);
                if (start >= shape.EndUtc || end <= shape.StartUtc) continue;
                var balance = await refunds.GetItemBalanceAsync(pass.InvoiceItemId, ct);
                // Check-ins are recorded by member and date; they are not linked to a specific package.
                var checkedIn = await db.Set<GymCheckIn>().AnyAsync(c => c.MemberId == pass.MemberId
                    && c.CheckInTime >= start && c.CheckInTime < end, ct);
                rows.Add(new(pass.PassId, "GymDayPass", pass.MemberId,
                    (await users.GetAsync(pass.MemberId, ct))?.FullName, "Gym day pass", start, end,
                    checkedIn ? "CheckInRecorded" : pass.Status, balance.IsPaid,
                    balance.RemainingPoints, balance.RefundedPoints, balance.RemainingPoints,
                    pass.InvoiceItemId, balance.InvoiceId));
            }
        }
        return rows.OrderBy(r => r.SourceType).ThenBy(r => r.SourceId).ToList();
    }

    private static string PreviewFingerprint(IncidentShape shape, IReadOnlyList<IncidentRefundRow> rows,
        IReadOnlyList<IncidentImpact> impacts)
        => Fingerprint(new { shape.Scope, shape.RoomId, shape.StartUtc, shape.EndUtc, shape.RoomIds,
            Rows = rows.Select(r => new { Row = r, r.InvoiceItemId, r.InvoiceId }), Impacts = impacts.Select(i => new { i.SourceType, i.SourceId, i.StartAtUtc, i.EndAtUtc }) });

    private static List<IncidentRefundReceipt> Selections(IReadOnlyList<IncidentRefundRow> rows, IncidentRequest request)
    {
        var supplied = request.Refunds;
        if (supplied is null || supplied.Count != rows.Count || supplied.Select(r => r.SourceId).Distinct().Count() != supplied.Count)
            throw new ConflictException("incident_refund_preview_changed", "Review every affected service before confirming.");
        var result = new List<IncidentRefundReceipt>();
        foreach (var row in rows)
        {
            var selection = supplied.SingleOrDefault(s => s.SourceId == row.SourceId)
                ?? throw new ConflictException("incident_refund_preview_changed", "Affected services changed. Refresh the preview.");
            if (selection.Points < 0 || selection.Points > row.MaximumRefundPoints || (!row.IsPaid && selection.Points != 0))
                throw new BadRequestException("incident_refund_points_invalid", "Enter whole points within the remaining refundable balance.");
            var reason = selection.AdjustmentReason?.Trim();
            if (selection.Points != row.SuggestedRefundPoints && (reason?.Length is not >= 3 or > 500))
                throw new BadRequestException("incident_refund_reason_required", "Explain each change to the suggested refund (3–500 characters).");
            result.Add(new(row.SourceId, row.SourceType, row.MemberId, row.MemberName, row.ServiceName,
                row.StartAtUtc, row.EndAtUtc, row.Status, row.IsPaid, selection.Points,
                row.SuggestedRefundPoints, row.RefundedPoints, reason, Guid.NewGuid()));
        }
        return result;
    }
}

public sealed record IncidentRefundSelection(Guid SourceId, int Points, string? AdjustmentReason = null);

public sealed record IncidentRefundRow(Guid SourceId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid MemberId, string? MemberName,
    string ServiceName, DateTime StartAtUtc, DateTime EndAtUtc, string Status, bool IsPaid,
    int MaximumRefundPoints, int RefundedPoints, int SuggestedRefundPoints,
    [property: System.Text.Json.Serialization.JsonIgnore] Guid? InvoiceItemId,
    [property: System.Text.Json.Serialization.JsonIgnore] Guid InvoiceId);

public sealed record IncidentRefundReceipt(Guid SourceId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid MemberId, string? MemberName,
    string ServiceName, DateTime StartAtUtc, DateTime EndAtUtc, string Status, bool IsPaid,
    int Points, int SuggestedPoints, int PreviouslyRefundedPoints, string? AdjustmentReason, Guid NotificationSourceId);
