using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed partial class IncidentService
{
    public async Task CancelAsync(Guid incidentId, Guid managerId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var incident = await db.Set<IncidentNotice>().FromSqlInterpolated(
            $"SELECT * FROM incident_notices WHERE incident_id = {incidentId} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("incident_not_found", "Incident not found.");
        // Retrying a completed cancellation must never send a second announcement.
        if (incident.CancelledAtUtc is not null) return;
        if (incident.EndAtUtc <= clock.UtcNow)
            throw new ConflictException("incident_already_ended", "An incident that has ended cannot be cancelled.");

        incident.CancelledAtUtc = clock.UtcNow;
        incident.CancelledByUserId = managerId;
        var blocks = await db.Set<RoomBlock>().Where(b => b.IncidentId == incidentId).ToListAsync(ct);
        foreach (var block in blocks)
            await occupancy.ReleaseAsync(OccupancySources.RoomBlock, block.BlockId, ct);
        db.Set<RoomBlock>().RemoveRange(blocks);
        await db.SaveChangesAsync(ct);

        // Older overlapping incidents share blocks. Preserve their coverage before opening any gaps.
        foreach (var released in blocks)
        {
            var remaining = await db.Set<IncidentNotice>().AsNoTracking().Where(i => i.CancelledAtUtc == null
                && (i.Scope == IncidentScope.Center || i.RoomId == released.RoomId)
                && i.StartAtUtc < released.EndAtUtc && i.EndAtUtc > released.StartAtUtc)
                .OrderBy(i => i.CreatedAtUtc).ThenBy(i => i.IncidentId).ToListAsync(ct);
            foreach (var other in remaining)
            {
                var start = other.StartAtUtc > released.StartAtUtc ? other.StartAtUtc : released.StartAtUtc;
                var end = other.EndAtUtc < released.EndAtUtc ? other.EndAtUtc : released.EndAtUtc;
                var existing = await db.Set<RoomBlock>().AsNoTracking().Where(b => b.RoomId == released.RoomId
                    && b.StartAtUtc < end && b.EndAtUtc > start).OrderBy(b => b.StartAtUtc).ToListAsync(ct);
                var cursor = start;
                var gaps = new List<(DateTime Start, DateTime End)>();
                foreach (var block in existing)
                {
                    if (block.StartAtUtc > cursor) gaps.Add((cursor, block.StartAtUtc < end ? block.StartAtUtc : end));
                    if (block.EndAtUtc > cursor) cursor = block.EndAtUtc;
                }
                if (cursor < end) gaps.Add((cursor, end));
                foreach (var gap in gaps.Where(g => g.End > g.Start))
                {
                    var block = new RoomBlock { BlockId = Guid.NewGuid(), RoomId = released.RoomId,
                        StartAtUtc = gap.Start, EndAtUtc = gap.End, IncidentId = other.IncidentId,
                        Reason = other.Reason, CreatedByUserId = other.CreatedByUserId };
                    var result = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.RoomBlock,
                        block.BlockId, block.RoomId, null, gap.Start, gap.End), ct);
                    if (!result.Succeeded) throw new OccupancyConflictException(result.Conflicts);
                    db.Set<RoomBlock>().Add(block);
                    await db.SaveChangesAsync(ct);
                }
            }
        }

        var time = VietnamTime.ToLocal(incident.CancelledAtUtc.Value).ToString("dd/MM/yyyy HH:mm");
        var room = incident.Scope == IncidentScope.Center ? null
            : await db.Set<Room>().Where(r => r.RoomId == incident.RoomId).Select(r => r.Name).SingleAsync(ct);
        var title = room is null ? "The center has reopened" : $"Court {room} has reopened";
        var message = room is null
            ? $"The center has resumed operations as of {time}. You can check availability and book a court again. Cancelled bookings will not be restored automatically. Please check the status of courts and rooms before your visit."
            : $"Court {room} has resumed operations as of {time}. You can check availability and book the court as needed. Cancelled bookings will not be restored automatically. Please check the status of courts and rooms before your visit.";
        var recipientIds = await delivery.RecipientIdsAsync(NotificationEvents.IncidentCreated, incidentId, ct);
        var recipients = await db.Set<UserAccount>().AsNoTracking()
            .Where(u => recipientIds.Contains(u.UserId) && u.Status == UserStatus.Active)
            .Select(u => new { u.UserId, u.Email }).ToListAsync(ct);
        foreach (var recipient in recipients)
        {
            notifications.Queue(new NotificationRequest(recipient.UserId, NotificationEvents.IncidentCancelled,
                title + "\n\n" + message, incidentId));
            notifications.QueueEmail(new EmailNotificationRequest(recipient.UserId, recipient.Email,
                NotificationEvents.IncidentCancelled, incidentId, title, EmailContent.Paragraph(message)));
        }
        audit.Write(new AuditEntry(managerId, "CANCEL_CENTER_INCIDENT", nameof(IncidentNotice), incidentId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { incident.CancelledAtUtc, incident.CancelledByUserId })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
