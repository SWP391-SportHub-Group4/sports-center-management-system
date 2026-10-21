using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Jobs;

public sealed class MemberCourseNotificationsJob(IServiceProvider services, ILogger<MemberCourseNotificationsJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(MemberCourseNotificationsJob);

    protected override Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => scopedServices.GetRequiredService<MemberCourseNotificationService>().QueueDueAsync(ct);
}

public sealed class MemberCourseNotificationService(
    SportHub.Scheduling.Application.Services.ClassSessionReminderService reminders)
{
    public async Task QueueDueAsync(CancellationToken ct = default)
    {
        // One worker owns reminders and linked-cohort notices across both API contracts.
        await reminders.RunAsync(ct, includeLateEnrollment: true);

    }
}
