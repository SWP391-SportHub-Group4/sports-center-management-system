using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Enums;

namespace SportHub.API.Jobs;

/// <summary>Expires Memberships by Vietnam date and queues one reminder; legacy session counters have no effect.</summary>
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
                         && mp.EndDate < today)
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
            .Select(mp => new { mp.MemberPackageId, mp.MemberId, mp.EndDate, PackageName = mp.Package!.Name })
            .ToListAsync(ct);

        if (expiring.Count == 0)
        {
            return;
        }

        var packageIds = expiring.Select(e => e.MemberPackageId).ToList();

        // Không nhắc lại gói đã nhắc: job chạy mỗi 15 phút, thiếu bước này thì hội viên nhận
        // gần 100 thông báo giống hệt nhau mỗi ngày.
        var alreadyNotified = await db.Notifications
            .Where(n => n.SourceEventType == Notification.Domain.Enums.NotificationSourceEventType.PackageExpiring
                        && n.SourceEntityId != null
                        && packageIds.Contains(n.SourceEntityId.Value))
            .Select(n => n.SourceEntityId!.Value)
            .ToListAsync(ct);

        var pending = expiring.Where(e => !alreadyNotified.Contains(e.MemberPackageId)).ToList();

        foreach (var item in pending)
        {
            notifications.Queue(new NotificationRequest(
                item.MemberId,
                NotificationEvents.PackageExpiring,
                $"Your package {item.PackageName} expires on {item.EndDate:dd/MM/yyyy}. "
                + "Contact reception to renew it if you want to continue training.",
                item.MemberPackageId));
        }

        if (pending.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("BR-33: created {Count} package expiry notices.", pending.Count);
        }
    }
}
