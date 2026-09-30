using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Kế hoạch và kết quả tập luyện — BR-23 (chỉ HLV có quan hệ Active mới lập kế hoạch),
/// BR-24 (chỉ HLV thực sự dạy buổi đó mới ghi kết quả).
///
/// Đổi 29/09/2026 (BE-4): kết quả gắn với PtSession, không còn Enrollment (Yoga/Group X không
/// có WorkoutResult). Việc tạo/hoàn thành PtSession thuộc PtSessionLifecycle (Phase 3) — service
/// này chỉ ghi kết quả cho session ĐÃ tồn tại và đã/đang Completed.
/// </summary>
public sealed class WorkoutService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : IWorkoutService
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;
    public const int MaximumProgressRangeDays = 366;

    public async Task<IReadOnlyList<WorkoutPlanResponse>> GetPlansAsync(
        Guid? memberId,
        Guid? coachId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = db.Set<WorkoutPlan>().AsNoTracking();

        if (memberId is not null)
        {
            query = query.Where(p => p.MemberId == memberId);
        }

        if (coachId is not null)
        {
            query = query.Where(p => p.CoachId == coachId);
        }

        (page, pageSize) = NormalizePage(page, pageSize);
        return await query.OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(PlanProjection()).ToListAsync(ct);
    }

    public async Task<WorkoutPlanResponse> CreatePlanAsync(
        CreateWorkoutPlanRequest request,
        Guid coachId,
        CancellationToken ct = default)
    {
        // BR-23 — điều kiện là có quan hệ huấn luyện ĐANG hoạt động giữa đúng cặp Coach–Member.
        // Quan hệ đã Ended không dùng được: HLV cũ không lập kế hoạch mới cho hội viên nữa.
        var relationship = await db.Set<CoachMemberRelationship>()
            .Where(r => r.CoachId == coachId
                        && r.MemberId == request.MemberId
                        && r.Status == RelationshipStatus.Active)
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync(ct)
            ?? throw new ForbiddenException(
                "no_active_relationship",
                "Bạn chưa có quan hệ huấn luyện đang hoạt động với hội viên này (BR-23).");

        var now = clock.UtcNow;
        var plan = new WorkoutPlan
        {
            PlanId = Guid.NewGuid(),
            MemberId = request.MemberId,
            CoachId = coachId,
            RelationshipId = relationship.RelationshipId,

            // Snapshot mục tiêu/trình độ tại thời điểm lập: hồ sơ hội viên đổi sau này không
            // được làm sai lệch căn cứ của một kế hoạch đã giao.
            Goal = request.Goal.Trim(),
            Level = request.Level.Trim(),
            CreatedAt = now,
            Status = WorkoutPlanStatus.Draft,
            UpdatedAt = now,
            Version = 0
        };

        db.Set<WorkoutPlan>().Add(plan);

        foreach (var item in request.Items)
        {
            db.Set<WorkoutPlanItem>().Add(new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(),
                PlanId = plan.PlanId,
                Exercise = item.Exercise.Trim(),
                Sets = item.Sets,
                Reps = item.Reps,
                Notes = string.IsNullOrWhiteSpace(item.Notes) ? null : item.Notes.Trim()
            });
        }

        audit.Write(new AuditEntry(
            coachId, "CREATE_WORKOUT_PLAN", nameof(WorkoutPlan), plan.PlanId.ToString(),
            NewValue: $"{{\"memberId\":\"{request.MemberId}\",\"itemCount\":{request.Items.Count}}}"));

        await db.SaveChangesAsync(ct);

        return await GetPlanAsync(plan.PlanId, ct);
    }

    public async Task<WorkoutPlanResponse> UpdatePlanAsync(
        Guid planId,
        UpdateWorkoutPlanRequest request,
        Guid coachId,
        CancellationToken ct = default)
    {
        var plan = await db.Set<WorkoutPlan>()
            .Include(p => p.Items)
            .SingleOrDefaultAsync(p => p.PlanId == planId, ct)
            ?? throw new NotFoundException("workout_plan_not_found", "Không tìm thấy kế hoạch tập.");

        EnsureOwner(plan, coachId);
        await EnsureActiveRelationshipAsync(plan.RelationshipId, ct);

        if (plan.Status == WorkoutPlanStatus.Archived)
        {
            throw new ConflictException("workout_plan_archived", "Kế hoạch đã lưu trữ nên không thể chỉnh sửa.");
        }

        if (plan.Version != request.Version)
        {
            throw new ConflictException("workout_plan_version_conflict", "Kế hoạch đã được cập nhật ở nơi khác.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        plan.Goal = request.Goal.Trim();
        plan.Level = request.Level.Trim();
        plan.UpdatedAt = clock.UtcNow;
        plan.Version++;

        db.Set<WorkoutPlanItem>().RemoveRange(plan.Items);
        foreach (var item in request.Items)
        {
            db.Set<WorkoutPlanItem>().Add(new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(),
                PlanId = plan.PlanId,
                Exercise = item.Exercise.Trim(),
                Sets = item.Sets,
                Reps = item.Reps,
                Notes = string.IsNullOrWhiteSpace(item.Notes) ? null : item.Notes.Trim()
            });
        }

        audit.Write(new AuditEntry(coachId, "UPDATE_WORKOUT_PLAN", nameof(WorkoutPlan), plan.PlanId.ToString(),
            NewValue: $"{{\"version\":{plan.Version},\"itemCount\":{request.Items.Count}}}"));

        try
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("workout_plan_version_conflict", "Kế hoạch đã được cập nhật ở nơi khác.");
        }

        return await GetPlanAsync(plan.PlanId, ct);
    }

    public Task<WorkoutPlanResponse> ActivatePlanAsync(
        Guid planId, Guid coachId, CancellationToken ct = default)
        => ChangePlanStatusAsync(planId, coachId, WorkoutPlanStatus.Active, ct);

    public Task<WorkoutPlanResponse> ArchivePlanAsync(
        Guid planId, Guid coachId, CancellationToken ct = default)
        => ChangePlanStatusAsync(planId, coachId, WorkoutPlanStatus.Archived, ct);

    public async Task<IReadOnlyList<WorkoutResultResponse>> GetResultsAsync(
        Guid? memberId,
        Guid? coachId,
        DateTime? sinceUtc,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = db.Set<WorkoutResult>().AsNoTracking();

        if (memberId is not null)
        {
            query = query.Where(r => r.PtSession!.MemberId == memberId);
        }

        if (coachId is not null)
        {
            query = query.Where(r => r.CoachId == coachId);
        }

        if (sinceUtc is not null)
        {
            query = query.Where(r => r.RecordedAt >= sinceUtc);
        }

        (page, pageSize) = NormalizePage(page, pageSize);
        return await query.OrderByDescending(r => r.RecordedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(ResultProjection()).ToListAsync(ct);
    }

    public async Task<WorkoutResultResponse> SaveResultAsync(
        SaveWorkoutResultRequest request,
        Guid coachId,
        CancellationToken ct = default)
    {
        var session = await db.Set<PtSession>()
            .SingleOrDefaultAsync(s => s.SessionId == request.PtSessionId, ct)
            ?? throw new NotFoundException("pt_session_not_found", "Không tìm thấy buổi PT.");

        // BR-24 — chỉ HLV THỰC SỰ DẠY buổi đó mới ghi được kết quả.
        if (session.CoachId != coachId)
        {
            throw new ForbiddenException(
                "not_session_coach", "Chỉ HLV giảng dạy buổi PT này mới ghi được kết quả tập (BR-24).");
        }

        // Chỉ ghi result khi session đã/đang chuyển Completed (BE-4 §5.5) — Scheduled/cancelled/
        // no-show không có kết quả tập.
        if (session.Status != PtSessionStatus.Completed)
        {
            throw new ConflictException(
                "pt_session_not_completable",
                $"Buổi PT đang ở trạng thái {session.Status} — chỉ ghi được kết quả khi đã hoàn thành.");
        }

        // 1 result/session (unique PtSessionId) — ghi lại là cập nhật, không tạo bản ghi thứ hai.
        var result = await db.Set<WorkoutResult>()
            .SingleOrDefaultAsync(r => r.PtSessionId == request.PtSessionId, ct);

        var isNew = result is null;

        if (result is null)
        {
            result = new WorkoutResult
            {
                ResultId = Guid.NewGuid(),
                PtSessionId = request.PtSessionId,
                CoachId = coachId
            };

            db.Set<WorkoutResult>().Add(result);
        }

        result.ProgressNote = string.IsNullOrWhiteSpace(request.ProgressNote) ? null : request.ProgressNote.Trim();
        result.CoachComment = string.IsNullOrWhiteSpace(request.CoachComment) ? null : request.CoachComment.Trim();
        result.RecordedAt = clock.UtcNow;

        audit.Write(new AuditEntry(
            coachId,
            isNew ? "CREATE_WORKOUT_RESULT" : "UPDATE_WORKOUT_RESULT",
            nameof(WorkoutResult), result.ResultId.ToString(),
            NewValue: $"{{\"ptSessionId\":\"{request.PtSessionId}\"}}"));

        await db.SaveChangesAsync(ct);

        return await GetResultAsync(result.ResultId, ct);
    }

    public async Task<ProgressTimelineResponse> GetProgressAsync(
        Guid memberId,
        Guid? coachId,
        DateTime? fromUtc,
        DateTime? toUtc,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        (page, pageSize) = NormalizePage(page, pageSize);

        if (fromUtc is not null && toUtc is not null && fromUtc > toUtc)
        {
            throw new BadRequestException("invalid_progress_range", "Thời điểm bắt đầu phải trước thời điểm kết thúc.");
        }
        if (fromUtc is not null && toUtc is not null
            && toUtc.Value - fromUtc.Value > TimeSpan.FromDays(MaximumProgressRangeDays))
        {
            throw new BadRequestException(
                "range_too_large", $"Khoảng tiến độ tối đa {MaximumProgressRangeDays} ngày.");
        }

        if (coachId is not null)
        {
            var active = await db.Set<CoachMemberRelationship>().AnyAsync(
                r => r.CoachId == coachId && r.MemberId == memberId && r.Status == RelationshipStatus.Active, ct);
            if (!active)
            {
                throw new ForbiddenException("no_active_relationship", "Bạn không phụ trách hội viên này.");
            }
        }

        var query = db.Set<PtSession>().AsNoTracking().Where(s => s.MemberId == memberId);
        if (coachId is not null)
        {
            query = query.Where(s => s.CoachId == coachId);
        }
        if (fromUtc is not null)
        {
            query = query.Where(s => s.StartAtUtc >= fromUtc);
        }
        if (toUtc is not null)
        {
            query = query.Where(s => s.StartAtUtc <= toUtc);
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(s => s.StartAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new ProgressTimelineItemResponse(
                s.SessionId, s.StartAtUtc, s.EndAtUtc, s.Status,
                s.MemberId, s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email,
                s.CoachId, s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email,
                s.Result == null ? null : s.Result.ResultId,
                s.Result == null ? null : s.Result.ProgressNote,
                s.Result == null ? null : s.Result.CoachComment,
                s.Result == null ? null : s.Result.RecordedAt))
            .ToListAsync(ct);

        return new ProgressTimelineResponse(page, pageSize, total, items);
    }

    private async Task<WorkoutPlanResponse> ChangePlanStatusAsync(
        Guid planId, Guid coachId, WorkoutPlanStatus target, CancellationToken ct)
    {
        var plan = await db.Set<WorkoutPlan>().SingleOrDefaultAsync(p => p.PlanId == planId, ct)
            ?? throw new NotFoundException("workout_plan_not_found", "Không tìm thấy kế hoạch tập.");
        EnsureOwner(plan, coachId);
        await EnsureActiveRelationshipAsync(plan.RelationshipId, ct);

        if (plan.Status == target)
        {
            return await GetPlanAsync(planId, ct);
        }
        if (target == WorkoutPlanStatus.Active && plan.Status != WorkoutPlanStatus.Draft)
        {
            throw new ConflictException("invalid_workout_plan_transition", "Chỉ kế hoạch nháp mới có thể kích hoạt.");
        }
        if (target == WorkoutPlanStatus.Archived && plan.Status == WorkoutPlanStatus.Archived)
        {
            return await GetPlanAsync(planId, ct);
        }

        plan.Status = target;
        plan.UpdatedAt = clock.UtcNow;
        plan.Version++;
        audit.Write(new AuditEntry(coachId, $"{target.ToString().ToUpperInvariant()}_WORKOUT_PLAN",
            nameof(WorkoutPlan), plan.PlanId.ToString()));
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("workout_plan_version_conflict", "Kế hoạch đã được cập nhật ở nơi khác.");
        }
        return await GetPlanAsync(planId, ct);
    }

    private static void EnsureOwner(WorkoutPlan plan, Guid coachId)
    {
        if (plan.CoachId != coachId)
        {
            throw new ForbiddenException("workout_plan_not_owned", "Bạn không sở hữu kế hoạch tập này.");
        }
    }

    private async Task EnsureActiveRelationshipAsync(Guid relationshipId, CancellationToken ct)
    {
        if (!await db.Set<CoachMemberRelationship>().AnyAsync(
                r => r.RelationshipId == relationshipId && r.Status == RelationshipStatus.Active, ct))
        {
            throw new ForbiddenException("no_active_relationship", "Quan hệ huấn luyện của kế hoạch không còn hoạt động.");
        }
    }

    private static (int Page, int PageSize) NormalizePage(int page, int pageSize)
        => (Math.Clamp(page, 1, 100_000),
            Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize));

    private async Task<WorkoutPlanResponse> GetPlanAsync(Guid planId, CancellationToken ct)
        => await db.Set<WorkoutPlan>().AsNoTracking().Where(p => p.PlanId == planId).Select(PlanProjection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("workout_plan_not_found", "Không tìm thấy kế hoạch tập.");

    private async Task<WorkoutResultResponse> GetResultAsync(Guid resultId, CancellationToken ct)
        => await db.Set<WorkoutResult>().AsNoTracking().Where(r => r.ResultId == resultId).Select(ResultProjection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("workout_result_not_found", "Không tìm thấy kết quả tập.");

    private static System.Linq.Expressions.Expression<Func<WorkoutPlan, WorkoutPlanResponse>> PlanProjection()
        => p => new WorkoutPlanResponse(
            p.PlanId,
            p.MemberId,
            p.Member!.Profile != null ? p.Member.Profile.FullName : p.Member.Email,
            p.CoachId,
            p.Coach!.Profile != null ? p.Coach.Profile.FullName : p.Coach.Email,
            p.RelationshipId,
            p.Goal,
            p.Level,
            p.CreatedAt,
            p.Status,
            p.UpdatedAt,
            p.Version,
            p.Items.Select(i => new WorkoutPlanItemResponse(i.ItemId, i.Exercise, i.Sets, i.Reps, i.Notes)).ToList());

    private static System.Linq.Expressions.Expression<Func<WorkoutResult, WorkoutResultResponse>> ResultProjection()
        => r => new WorkoutResultResponse(
            r.ResultId,
            r.PtSessionId,
            r.PtSession!.StartAtUtc,
            r.PtSession.MemberId,
            r.PtSession.Member!.Profile != null ? r.PtSession.Member.Profile.FullName : r.PtSession.Member.Email,
            r.CoachId,
            r.Coach!.Profile != null ? r.Coach.Profile.FullName : r.Coach.Email,
            r.ProgressNote,
            r.CoachComment,
            r.RecordedAt);
}
