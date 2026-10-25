using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Services;

public sealed record SupportRemindResult(Guid RequestId, int RemindCount, DateTime CanRemindAtUtc,
    bool Sent);

public sealed class SupportReminderService(ISportHubDbContext db, IClock clock,
    ISystemSettingProvider settings, INotificationWriter notifications, IAuditWriter audit)
{
    private const string MemberEvent = "REMINDED_BY_MEMBER";
    private const string StaffEvent = "REMINDED_BY_STAFF";
    private const string SlaEvent = "SLA_REMINDER_SENT";

    public static DateTime CanRemindAt(MemberSupportRequest request, int cooldownHours)
    {
        var afterLast = request.LastMemberRemindAtUtc?.AddHours(cooldownHours);
        return afterLast is DateTime last && last > request.SlaDueAtUtc ? last : request.SlaDueAtUtc;
    }

    /// <summary>The member reminds us, or (byStaff) the front desk reminds the managers on the member's behalf.</summary>
    public async Task<SupportRemindResult> RemindAsync(Guid requestId, Guid actorId, bool byStaff, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
            $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
        if (byStaff && request.Category != "PAYMENT")
            throw new ForbiddenException(PaymentSupportErrorCodes.SupportRemindPaymentOnly,
                "Front desk can remind only on payment requests.");
        if (!byStaff && request.MemberId != actorId)
            throw new ForbiddenException("support_request_not_owned", "Support request not owned.");
        if (IsFinal(request.Status))
            throw new ConflictException("support_request_final", "Support request has already been finalized.");

        var now = clock.UtcNow;
        var cooldownHours = await settings.GetIntAsync(SystemSettingKeys.SupportRemindCooldownHours, ct);
        var allowedAt = CanRemindAt(request, cooldownHours);
        if (now < allowedAt)
        {
            await tx.CommitAsync(ct);
            return new SupportRemindResult(requestId, request.RemindCount, allowedAt, false);
        }

        var recipients = await RecipientsAsync(request, ct);
        var sent = 0;
        foreach (var recipientId in recipients)
        {
            if (await RecentlyRemindedAsync(requestId, recipientId, now, cooldownHours, ct)) continue;
            var eventId = Guid.NewGuid();
            db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
            {
                EventId = eventId, RequestId = requestId, ActorUserId = actorId,
                TargetUserId = recipientId, Type = byStaff ? StaffEvent : MemberEvent, CreatedAt = now
            });
            notifications.Queue(new NotificationRequest(recipientId, NotificationEvents.SupportRequestReminded,
                byStaff
                    ? $"The front desk reminded you about support request {request.Subject} on the member's behalf."
                    : $"A member reminded us about support request {request.Subject}.", eventId));
            sent++;
        }
        if (sent == 0)
            db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
            {
                EventId = Guid.NewGuid(), RequestId = requestId, ActorUserId = actorId,
                Type = byStaff ? StaffEvent : MemberEvent, CreatedAt = now
            });
        request.LastMemberRemindAtUtc = now;
        request.RemindCount++;
        request.UpdatedAt = now;
        audit.Write(new AuditEntry(actorId, "REMIND_SUPPORT_REQUEST", nameof(MemberSupportRequest),
            requestId.ToString(), NewValue: JsonSerializer.Serialize(new { request.RequestId, request.RemindCount, onBehalfOfMember = byStaff })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new SupportRemindResult(requestId, request.RemindCount, now.AddHours(cooldownHours), true);
    }

    public async Task<int> SendDueSlaAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var ids = await db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(r => r.SlaDueAtUtc <= now && r.Status != "DONE" && r.Status != "REJECTED"
                && r.Status != "CLOSED")
            .OrderBy(r => r.SlaDueAtUtc).Select(r => r.RequestId).ToListAsync(ct);
        var cooldownHours = await settings.GetIntAsync(SystemSettingKeys.SupportRemindCooldownHours, ct);
        var sent = 0;
        foreach (var requestId in ids)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var request = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
                $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE")
                .SingleOrDefaultAsync(ct);
            if (request is null || IsFinal(request.Status) || request.SlaDueAtUtc > now)
            {
                await tx.CommitAsync(ct);
                continue;
            }
            foreach (var recipientId in await RecipientsAsync(request, ct))
            {
                if (await RecentlyRemindedAsync(requestId, recipientId, now, cooldownHours, ct)) continue;
                var eventId = Guid.NewGuid();
                db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
                {
                    EventId = eventId, RequestId = requestId, ActorUserId = null,
                    TargetUserId = recipientId, Type = SlaEvent, CreatedAt = now
                });
                notifications.Queue(new NotificationRequest(recipientId, NotificationEvents.SupportSlaReminder,
                    $"Support request {request.Subject} is overdue. Please review it.", eventId));
                request.LastStaffRemindAtUtc = now;
                sent++;
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        return sent;
    }

    /// <summary>The assignee, else every manager and receptionist. Payment requests are handled by managers only.</summary>
    private async Task<List<Guid>> RecipientsAsync(MemberSupportRequest request, CancellationToken ct)
    {
        var managersOnly = request.Category == "PAYMENT";
        if (request.AssignedToUserId is Guid assignee)
            return await db.Set<UserAccount>().AsNoTracking()
                .Where(u => u.UserId == assignee && u.Status == UserStatus.Active
                    && (!managersOnly || (u.Role != null && u.Role.RoleName == UserRole.CenterManager)))
                .Select(u => u.UserId).ToListAsync(ct);
        return await db.Set<UserAccount>().AsNoTracking()
            .Where(u => u.Status == UserStatus.Active && u.Role != null
                && (u.Role.RoleName == UserRole.CenterManager
                    || (!managersOnly && u.Role.RoleName == UserRole.Receptionist)))
            .Select(u => u.UserId).ToListAsync(ct);
    }

    private Task<bool> RecentlyRemindedAsync(Guid requestId, Guid recipientId, DateTime now,
        int cooldownHours, CancellationToken ct)
        => db.Set<MemberSupportEvent>().AnyAsync(e => e.RequestId == requestId
            && e.TargetUserId == recipientId && (e.Type == MemberEvent || e.Type == StaffEvent || e.Type == SlaEvent)
            && e.CreatedAt > now.AddHours(-cooldownHours), ct);

    private static bool IsFinal(string status) => status is "DONE" or "REJECTED" or "CLOSED";
}
