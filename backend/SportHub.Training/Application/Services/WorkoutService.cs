using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Kế hoạch và kết quả tập luyện — BR-23 (chỉ HLV có quan hệ Active mới lập kế hoạch),
/// BR-24 (chỉ HLV thực sự dạy buổi đó mới ghi kết quả), BR-25 (hội viên chỉ xem),
/// BR-61 (Enrollment phải Confirmed tại thời điểm ghi).
/// </summary>
public sealed class WorkoutService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : IWorkoutService
{
    public async Task<IReadOnlyList<WorkoutPlanResponse>> GetPlansAsync(
        Guid? memberId,
        Guid? coachId,
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

        return await query.OrderByDescending(p => p.CreatedAt).Select(PlanProjection()).ToListAsync(ct);
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
            CreatedAt = clock.UtcNow
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

    public async Task<IReadOnlyList<WorkoutResultResponse>> GetResultsAsync(
        Guid? memberId,
        Guid? coachId,
        DateTime? sinceUtc,
        CancellationToken ct = default)
    {
        var query = db.Set<WorkoutResult>().AsNoTracking();

        if (memberId is not null)
        {
            query = query.Where(r => r.Enrollment!.MemberId == memberId);
        }

        if (coachId is not null)
        {
            query = query.Where(r => r.CoachId == coachId);
        }

        if (sinceUtc is not null)
        {
            query = query.Where(r => r.RecordedAt >= sinceUtc);
        }

        return await query.OrderByDescending(r => r.RecordedAt).Select(ResultProjection()).ToListAsync(ct);
    }

    public async Task<WorkoutResultResponse> SaveResultAsync(
        SaveWorkoutResultRequest request,
        Guid coachId,
        CancellationToken ct = default)
    {
        var enrollment = await db.Set<Enrollment>()
            .Include(e => e.Session)
            .SingleOrDefaultAsync(e => e.EnrollmentId == request.EnrollmentId, ct)
            ?? throw new NotFoundException("enrollment_not_found", "Không tìm thấy đăng ký.");

        // BR-24 — chỉ HLV THỰC SỰ DẠY buổi đó mới ghi được kết quả. So với CoachId của chính
        // buổi học chứ không phải của lớp: buổi có thể đã đổi HLV (BR-14).
        if (enrollment.Session!.CoachId != coachId)
        {
            throw new ForbiddenException(
                "not_session_coach", "Chỉ HLV giảng dạy buổi học này mới ghi được kết quả tập (BR-24).");
        }

        // BR-61 — Enrollment phải Confirmed TẠI THỜI ĐIỂM GHI. FK sang Enrollment chỉ đảm bảo
        // đăng ký tồn tại, không đảm bảo còn hiệu lực.
        //
        // KHÔNG thêm điều kiện Attendance.Status = Present: SSOT §7 ghi rõ đó là câu hỏi CHƯA
        // được quyết định, nên không tự siết thêm.
        if (enrollment.Status != EnrollmentStatus.Confirmed)
        {
            throw new ConflictException(
                "enrollment_not_confirmed",
                $"Đăng ký đang ở trạng thái {enrollment.Status} — không ghi được kết quả tập (BR-61).");
        }

        // Một kết quả cho mỗi (đăng ký, HLV): ghi lại là cập nhật nhận xét, không tạo bản ghi
        // thứ hai chồng lên nhau. Entity cho phép 1—N nhưng nhiều bản ghi cùng buổi của cùng
        // một HLV không có ý nghĩa nghiệp vụ nào.
        var result = await db.Set<WorkoutResult>()
            .SingleOrDefaultAsync(r => r.EnrollmentId == request.EnrollmentId && r.CoachId == coachId, ct);

        var isNew = result is null;

        if (result is null)
        {
            result = new WorkoutResult
            {
                ResultId = Guid.NewGuid(),
                EnrollmentId = request.EnrollmentId,
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
            NewValue: $"{{\"enrollmentId\":\"{request.EnrollmentId}\",\"sessionId\":\"{enrollment.SessionId}\"}}"));

        await db.SaveChangesAsync(ct);

        return await GetResultAsync(result.ResultId, ct);
    }

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
            p.Items.Select(i => new WorkoutPlanItemResponse(i.ItemId, i.Exercise, i.Sets, i.Reps, i.Notes)).ToList());

    private static System.Linq.Expressions.Expression<Func<WorkoutResult, WorkoutResultResponse>> ResultProjection()
        => r => new WorkoutResultResponse(
            r.ResultId,
            r.EnrollmentId,
            r.Enrollment!.SessionId,
            r.Enrollment.Session!.Class!.Name,
            r.Enrollment.Session.StartAtUtc,
            r.Enrollment.MemberId,
            r.Enrollment.Member!.Profile != null ? r.Enrollment.Member.Profile.FullName : r.Enrollment.Member.Email,
            r.CoachId,
            r.Coach!.Profile != null ? r.Coach.Profile.FullName : r.Coach.Email,
            r.ProgressNote,
            r.CoachComment,
            r.RecordedAt);
}
