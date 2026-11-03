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
        var hours = await SportHub.BuildingBlocks.Abstractions.Configuration.CenterOperatingHours.ReadAsync(settings, ct);
        var from = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
        var to = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.EndUtc.AddTicks(-1)));
        var result = new List<IncidentDayPassMember>();
        foreach (var pass in await dayPasses.FindAsync(from, to, ct))
        {
            var start = VietnamTime.StartOfDayUtc(pass.UseDate).AddMinutes(hours.OpeningMinute);
            var expires = pass.ExpiresAtUtc ?? VietnamTime.StartOfDayUtc(pass.UseDate).AddMinutes(hours.ClosingMinute);
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
        await using var tx = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(ct) : null;
        var incident = await db.Set<IncidentNotice>().FromSqlInterpolated(
            $"SELECT * FROM incident_notices WHERE incident_id = {incidentId} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("incident_not_found", "Incident not found.");
        if (incident.DayPassNoticeSentAtUtc is not null) return;
        var affected = JsonSerializer.Deserialize<List<IncidentDayPassMember>>(incident.DayPassMembersJson) ?? [];
        if (affected.Count == 0)
            throw new ConflictException("incident_day_pass_members_empty", "This incident has no affected day-pass holders.");
        foreach (var memberPasses in affected.GroupBy(x => x.MemberId))
        {
            var memberId = memberPasses.Key;
            var deadlines = string.Join(", ", memberPasses.Select(p => p.ExpiresAtUtc).Distinct().Order()
                .Select(expiry => VietnamTime.ToLocal(expiry).ToString("dd/MM/yyyy HH:mm")));
            var text = $"The Gym is closed from {VietnamTime.ToLocal(incident.StartAtUtc):dd/MM/yyyy HH:mm} to {VietnamTime.ToLocal(incident.EndAtUtc):dd/MM/yyyy HH:mm} (Vietnam time). "
                + $"Reason: {incident.Reason}. Your affected Gym day-pass expiry time(s): {deadlines} (Vietnam time). "
                + "You can use your pass if the Gym reopens before its expiry. This incident does not cancel or extend your pass. "
                + "Please contact the Manager, or send a PAYMENT support request linked to your invoice if you need further help.";
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
        if (tx is not null) await tx.CommitAsync(ct);
    }
}

public sealed record IncidentDayPassMember(Guid PassId, Guid MemberId, string? MemberName, DateOnly UseDate, DateTime ExpiresAtUtc);
