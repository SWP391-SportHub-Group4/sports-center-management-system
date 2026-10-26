using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Rental.Domain;
using SportHub.BuildingBlocks.Abstractions.Audit;

namespace SportHub.Scheduling.Rental.Application;

public sealed partial class IncidentService
{
    private async Task<IReadOnlyList<IncidentDayPassMember>> DayPassMembersAsync(IncidentShape shape, CancellationToken ct)
    {
        if (!await ClosesGymAsync(shape, ct)) return [];
        var from = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
        var to = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.EndUtc.AddTicks(-1)));
        var result = new List<IncidentDayPassMember>();
        foreach (var pass in await dayPasses.FindAsync(from, to, ct))
        {
            var start = VietnamTime.StartOfDayUtc(pass.UseDate).AddHours(6);
            var expires = VietnamTime.StartOfDayUtc(pass.UseDate).AddHours(22);
            if (start >= shape.EndUtc || expires <= shape.StartUtc || pass.Status is not ("Active" or "Expired")) continue;
            var balance = await refunds.GetItemBalanceAsync(pass.InvoiceItemId, ct);
            if (!balance.IsPaid) continue;
            var member = await users.GetAsync(pass.MemberId, ct);
            result.Add(new(pass.PassId, pass.MemberId, member?.FullName, pass.UseDate, expires));
        }
        return result;
    }

    public async Task SendDayPassNoticeAsync(Guid incidentId, Guid actorId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var incident = await db.Set<IncidentNotice>().FromSqlInterpolated(
            $"SELECT * FROM incident_notices WHERE incident_id = {incidentId} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("incident_not_found", "Incident not found.");
        if (incident.DayPassNoticeSentAtUtc is not null) return;
        var affected = JsonSerializer.Deserialize<List<IncidentDayPassMember>>(incident.DayPassMembersJson) ?? [];
        if (affected.Count == 0)
            throw new ConflictException("incident_day_pass_members_empty", "This incident has no affected day-pass holders.");
        var text = $"The Gym is closed from {VietnamTime.ToLocal(incident.StartAtUtc):dd/MM/yyyy HH:mm} to {VietnamTime.ToLocal(incident.EndAtUtc):dd/MM/yyyy HH:mm} (Vietnam time). "
            + $"Reason: {incident.Reason}. Your Gym day pass still expires at 22:00 on its original date and can be used if the Gym reopens before then. "
            + "Please contact the Manager about a points gift, or send a PAYMENT support request linked to your invoice if you need further help. No refund or extension is applied automatically.";
        foreach (var memberId in affected.Select(x => x.MemberId).Distinct())
        {
            var contact = await users.GetAsync(memberId, ct);
            notifications.Queue(new NotificationRequest(memberId, NotificationEvents.IncidentResolution, text, incidentId));
            if (contact is not null)
                notifications.QueueEmail(new EmailNotificationRequest(memberId, contact.Email, NotificationEvents.IncidentResolution,
                    incidentId, "SportHub - Gym closure and your day pass", "<p>" + WebUtility.HtmlEncode(text) + "</p>"));
        }
        incident.DayPassNoticeSentAtUtc = clock.UtcNow;
        audit.Write(new AuditEntry(actorId, "NOTIFY_INCIDENT_DAY_PASS_MEMBERS", nameof(IncidentNotice), incidentId.ToString(),
            Reason: incident.Reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}

public sealed record IncidentDayPassMember(Guid PassId, Guid MemberId, string? MemberName, DateOnly UseDate, DateTime ExpiresAtUtc);
