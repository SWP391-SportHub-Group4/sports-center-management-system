using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

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

        var completedSessions = await db.ClassSessions
            .Where(s => s.Status == ClassSessionStatus.Scheduled && s.EndAtUtc <= now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassSessionStatus.Completed), ct);

        var started = await db.Classes
            .Where(c => c.Status == ClassStatus.Published
                        && c.Sessions.Any(s => s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc <= now))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.InProgress), ct);

        var finished = await db.Classes
            .Where(c => c.Status == ClassStatus.InProgress
                        && c.Sessions.Any(s => s.Status == ClassSessionStatus.Completed)
                        && !c.Sessions.Any(s => s.Status == ClassSessionStatus.Scheduled))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.Completed), ct);

        if (completedSessions + started + finished > 0)
        {
            logger.LogInformation(
                "ClassStatusJob: {Sessions} buổi Completed, {Started} khóa InProgress, {Finished} khóa Completed.",
                completedSessions, started, finished);
        }
    }
}
