using SportHub.API.Jobs;

namespace SportHub.API.Extensions;

public static class BackgroundJobExtensions
{
    public static IServiceCollection AddSportHubBackgroundJobs(this IServiceCollection services, bool enabled)
    {
        // Controllers also use these services when the local instance has no workers.
        services.AddSingleton<JobHealthRegistry>();
        services.AddScoped<MemberCourseNotificationService>();
        services.AddScoped<SupportPayoutMaintenance>();
        if (!enabled) return services;

        services.AddHostedService<CoachCredentialCleanupJob>();
        services.AddHostedService<MemberPackageExpiryJob>();
        services.AddHostedService<MemberCourseNotificationsJob>();
        services.AddHostedService<CoachAttendanceReminderJob>();
        services.AddHostedService<StaffInvitationExpiryJob>();
        services.AddHostedService<MemberInvitationExpiryJob>();
        services.AddHostedService<ClassStatusJob>();
        services.AddHostedService<ClassThresholdEvaluationJob>();
        services.AddHostedService<ClassThresholdResponseExpiryJob>();
        services.AddHostedService<CenterCancellationAutoRefundJob>();
        services.AddHostedService<RentalStatusJob>();
        services.AddHostedService<RoomOccupancyExpiryJob>();
        services.AddHostedService<SeatHoldExpiryJob>();
        services.AddHostedService<CheckoutExpiryJob>();
        services.AddHostedService<DayPassClosingJob>();
        services.AddHostedService<PaymentReconciliationJob>();
        services.AddHostedService<SupportSlaReminderJob>();
        services.AddHostedService<SupportPayoutAutoConfirmJob>();
        services.AddHostedService<PointHoldExpiryJob>();
        services.AddHostedService<NotificationDispatchJob>();
        services.AddHostedService<AvatarDeletionJob>();
        return services;
    }
}
