using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Jobs;

/// <summary>
/// Vòng đời theo thời gian của khóa học và buổi học. KHÔNG ghi Present/Absent và không sinh NoShow: điểm danh chỉ do Lễ tân ghi.
/// - Buổi Scheduled đã kết thúc → Completed.
/// - Khóa Published đã đến buổi đầu → InProgress (chặn nhận ghi danh mới; ghi danh còn bị chặn ở fulfillment dù job chưa chạy).
/// - Khóa InProgress mà mọi buổi còn hiệu lực đã Completed → Completed.
/// Mỗi bước là UPDATE có điều kiện theo trạng thái nguồn nên chạy lặp/nhiều instance vẫn idempotent.
/// </summary>
public sealed class ClassStatusJob(IServiceProvider services, ILogger<ClassStatusJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(5))
{
    protected override string JobName => nameof(ClassStatusJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var db = scopedServices.GetRequiredService<SportHubDbContext>();
        var now = scopedServices.GetRequiredService<IClock>().UtcNow;
        // Recover missed threshold work before advancing the time-based lifecycle.
        await scopedServices.GetRequiredService<IClassThresholdService>().EvaluateDueAsync(ct);
        await scopedServices.GetRequiredService<ThresholdResponseExpiryService>().ExpireAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 1)", ct);

        var completedSessions = await db.ClassSessions
            .Where(s => s.Status == ClassSessionStatus.Scheduled && s.EndAtUtc <= now
                && (s.Class!.Status == ClassStatus.InProgress
                    || s.Class.Status == ClassStatus.Published
                        && (s.Class.ThresholdStatus == ThresholdStatus.Met
                            || s.Class.ThresholdStatus == ThresholdStatus.WaivedByManager)))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassSessionStatus.Completed), ct);

        var started = await db.Classes
            .Where(c => c.Status == ClassStatus.Published
                        && (c.ThresholdStatus == ThresholdStatus.Met || c.ThresholdStatus == ThresholdStatus.WaivedByManager)
                        && c.Sessions.Any(s => s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc <= now))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.InProgress), ct);

        var finished = await db.Classes
            .Where(c => c.Status == ClassStatus.InProgress
                        && c.Sessions.Any(s => s.Status == ClassSessionStatus.Completed)
                        && !c.Sessions.Any(s => s.Status == ClassSessionStatus.Scheduled))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.Completed), ct);

        // Also repairs old manual/class assignments with no remaining confirmed class.
        await scopedServices.GetRequiredService<ICoachRelationshipRegistrar>().ReconcileAsync(null, null, null,
            "No remaining active courses after course completion or assignment cleanup.", ct);
        await tx.CommitAsync(ct);

        if (completedSessions + started + finished > 0)
        {
            logger.LogInformation(
                "ClassStatusJob: {Sessions} sessions completed, {Started} courses in progress, {Finished} courses completed.",
                completedSessions, started, finished);
        }
    }
}
