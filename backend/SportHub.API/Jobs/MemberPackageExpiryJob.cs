using System.Net;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Enums;
using SportHub.Notification.Domain.Enums;

namespace SportHub.API.Jobs;

/// <summary>Expires memberships by Vietnam date and queues one reminder per channel and package.</summary>
public sealed class MemberPackageExpiryJob(
    IServiceProvider services,
    ILogger<MemberPackageExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(15))
{
    protected override string JobName => nameof(MemberPackageExpiryJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var db = scopedServices.GetRequiredService<SportHubDbContext>();
        var clock = scopedServices.GetRequiredService<IClock>();
        var settings = scopedServices.GetRequiredService<ISystemSettingProvider>();
        var notifications = scopedServices.GetRequiredService<INotificationWriter>();

        var today = VietnamTime.TodayLocal(clock);

        // ExecuteUpdate: một câu UPDATE cho cả lô thay vì nạp từng entity — số gói hết hạn
        // trong một ngày có thể lớn và không cần vật chất hoá cái nào.
        var expired = await db.MemberPackages
            .Where(mp => mp.Status == MemberPackageStatus.Active
                         && (mp.EndDate < today
                             || (mp.ExpiresAtUtc != null && mp.ExpiresAtUtc <= clock.UtcNow)))
            .ExecuteUpdateAsync(
                s => s.SetProperty(mp => mp.Status, MemberPackageStatus.Expired), ct);

        if (expired > 0)
        {
            logger.LogInformation("BR-11: marked {Count} packages as expired.", expired);
        }

        var reminderDays = await settings.GetIntAsync(SystemSettingKeys.PackageExpiringReminderDays, ct);
        var threshold = today.AddDays(reminderDays);

        var expiring = await db.MemberPackages
            .Where(mp => mp.Status == MemberPackageStatus.Active
                         && mp.EndDate >= today
                         && mp.EndDate <= threshold
                         // Vé Gym 1 ngày hết hạn ngay trong ngày mua: không nhắc gia hạn.
                         && mp.PackageId != SportHub.Membership.Domain.DayPass.PackageId)
            .Select(mp => new
            {
                mp.MemberPackageId, mp.MemberId, mp.EndDate, PackageName = mp.Package!.Name,
                MemberEmail = mp.Member!.Email
            })
            .ToListAsync(ct);

        if (expiring.Count == 0)
        {
            return;
        }

        var packageIds = expiring.Select(e => e.MemberPackageId).ToList();

        // Check each channel separately so older in-app reminders can receive the missing email.
        var alreadyNotified = await db.Notifications
            .Where(n => n.SourceEventType == Notification.Domain.Enums.NotificationSourceEventType.PackageExpiring
                        && n.SourceEntityId != null
                        && packageIds.Contains(n.SourceEntityId.Value))
            .Select(n => new { PackageId = n.SourceEntityId!.Value, n.Channel })
            .ToListAsync(ct);

        var notified = alreadyNotified.Select(n => (n.PackageId, n.Channel)).ToHashSet();
        var queued = 0;

        foreach (var item in expiring)
        {
            var message = $"Your package {item.PackageName} expires on {item.EndDate:dd/MM/yyyy}. "
                + "Contact reception to renew it if you want to continue training.";

            if (!notified.Contains((item.MemberPackageId, NotificationChannel.InApp)))
            {
                notifications.Queue(new NotificationRequest(
                    item.MemberId, NotificationEvents.PackageExpiring, message, item.MemberPackageId));
                queued++;
            }

            if (!notified.Contains((item.MemberPackageId, NotificationChannel.Email))
                && !string.IsNullOrWhiteSpace(item.MemberEmail))
            {
                var safePackageName = WebUtility.HtmlEncode(item.PackageName);
                notifications.QueueEmail(new EmailNotificationRequest(
                    item.MemberId,
                    item.MemberEmail,
                    NotificationEvents.PackageExpiring,
                    item.MemberPackageId,
                    "SportHub - Your membership is expiring soon",
                    $"<p>Your package <strong>{safePackageName}</strong> expires on "
                    + $"<strong>{item.EndDate:dd/MM/yyyy}</strong>.</p>"
                    + "<p>Contact reception to renew it if you want to continue training.</p>"));
                queued++;
            }
        }

        if (queued > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("BR-33: created {Count} package expiry notices.", queued);
        }
    }
}
