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
        return rows.OrderBy(r => r.SourceType).ThenBy(r => r.SourceId).ToList();
    }

    private static string PreviewFingerprint(IncidentShape shape, IReadOnlyList<IncidentRefundRow> rows,
        IReadOnlyList<IncidentImpact> impacts, IReadOnlyList<IncidentDayPassMember> passMembers,
        IReadOnlyList<IncidentResolutionSelection>? resolutions = null)
        => Fingerprint(new { shape.Scope, shape.RoomId, shape.StartUtc, shape.EndUtc, shape.RoomIds,
            DayPassMembers = passMembers.OrderBy(p => p.PassId),
            Resolutions = (resolutions ?? []).OrderBy(p => p.SourceId),
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
