using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed partial class IncidentService
{
    private async Task QueueIncidentAnnouncementAsync(IncidentNotice incident, CancellationToken ct)
    {
        var location = incident.Scope == IncidentScope.Center
            ? "Whole center"
            : await db.Set<Room>().Where(r => r.RoomId == incident.RoomId)
                .Select(r => r.Name).SingleAsync(ct);
        var message = $"A center incident has been confirmed. Location: {location}. "
            + $"From {VietnamTime.ToLocal(incident.StartAtUtc):dd/MM/yyyy HH:mm} "
            + $"to {VietnamTime.ToLocal(incident.EndAtUtc):dd/MM/yyyy HH:mm} (Vietnam time). "
            + $"Reason: {incident.Reason}";
        var recipients = await db.Set<UserAccount>().AsNoTracking()
            .Where(u => u.Status == UserStatus.Active)
            .Select(u => new { u.UserId, u.Email }).ToListAsync(ct);
        var body = EmailContent.Paragraph(message);
        foreach (var recipient in recipients)
        {
            notifications.Queue(new NotificationRequest(recipient.UserId,
                NotificationEvents.IncidentCreated, message, incident.IncidentId));
            notifications.QueueEmail(new EmailNotificationRequest(recipient.UserId, recipient.Email,
                NotificationEvents.IncidentCreated, incident.IncidentId,
                "SportHub - Incident announcement", body));
        }
    }
}
