using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.Services;

public sealed class HomeworkService(
    ISportHubDbContext db,
    IAuditWriter audit,
    INotificationWriter notifications,
    IClock clock) : IHomeworkService
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;

    public async Task<IReadOnlyList<HomeworkResponse>> GetForCoachAsync(
        Guid coachId, Guid? memberId, HomeworkAssignmentStatus? status,
        int page, int pageSize, CancellationToken ct = default)
    {
        var query = db.Set<HomeworkAssignment>().AsNoTracking().Where(a => a.CoachId == coachId);
        if (memberId is not null) query = query.Where(a => a.MemberId == memberId);
        if (status is not null) query = query.Where(a => a.Status == status);
        (page, pageSize) = NormalizePage(page, pageSize);
        return await query.OrderBy(a => a.DueAt).ThenBy(a => a.AssignmentId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(Projection()).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<HomeworkResponse>> GetForMemberAsync(
        Guid memberId, HomeworkAssignmentStatus? status,
        int page, int pageSize, CancellationToken ct = default)
    {
        var query = db.Set<HomeworkAssignment>().AsNoTracking().Where(a => a.MemberId == memberId);
        if (status is not null) query = query.Where(a => a.Status == status);
        (page, pageSize) = NormalizePage(page, pageSize);
        return await query.OrderBy(a => a.DueAt).ThenBy(a => a.AssignmentId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(Projection()).ToListAsync(ct);
    }

    public async Task<HomeworkResponse> CreateAsync(
        CreateHomeworkRequest request, Guid coachId, CancellationToken ct = default)
    {
        var relationship = await db.Set<CoachMemberRelationship>()
            .Where(r => r.CoachId == coachId && r.MemberId == request.MemberId
                        && r.Status == RelationshipStatus.Active)
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync(ct)
            ?? throw new ForbiddenException("no_active_relationship", "Bạn không phụ trách hội viên này.");

        if (request.DueAt <= clock.UtcNow)
        {
            throw new ConflictException("invalid_homework_due_at", "Hạn hoàn thành phải sau thời điểm giao bài.");
        }

        if (request.SourceWorkoutPlanId is not null)
        {
            var validSource = await db.Set<WorkoutPlan>().AnyAsync(
                p => p.PlanId == request.SourceWorkoutPlanId && p.CoachId == coachId
                     && p.MemberId == request.MemberId && p.Status == WorkoutPlanStatus.Active, ct);
            if (!validSource)
            {
                throw new ConflictException("invalid_homework_source_plan",
                    "Kế hoạch nguồn không tồn tại, chưa kích hoạt hoặc không thuộc đúng PT và hội viên.");
            }
        }

        var assignment = new HomeworkAssignment
        {
            AssignmentId = Guid.NewGuid(),
            MemberId = request.MemberId,
            CoachId = coachId,
            RelationshipId = relationship.RelationshipId,
            SourceWorkoutPlanId = request.SourceWorkoutPlanId,
            Title = request.Title.Trim(),
            CoachNote = Clean(request.CoachNote),
            AssignedAt = clock.UtcNow,
            DueAt = request.DueAt,
            Status = HomeworkAssignmentStatus.Assigned,
            Version = 0
        };
        db.Set<HomeworkAssignment>().Add(assignment);
        AddItems(assignment.AssignmentId, request.Items);

        notifications.Queue(new NotificationRequest(
            request.MemberId, NotificationEvents.HomeworkAssigned,
            $"Bạn có bài tập về nhà mới: {assignment.Title}.", assignment.AssignmentId));
        audit.Write(new AuditEntry(coachId, "CREATE_HOMEWORK", nameof(HomeworkAssignment),
            assignment.AssignmentId.ToString(), NewValue: $"{{\"memberId\":\"{request.MemberId}\"}}"));
        await SaveAsync(ct);
        return await GetAsync(assignment.AssignmentId, ct);
    }

    public async Task<HomeworkResponse> UpdateAsync(
        Guid assignmentId, UpdateHomeworkRequest request, Guid coachId, CancellationToken ct = default)
    {
        var assignment = await OwnedByCoach(assignmentId, coachId, includeItems: true, ct);
        if (assignment.Status is HomeworkAssignmentStatus.Completed or HomeworkAssignmentStatus.Reviewed
            or HomeworkAssignmentStatus.Cancelled)
        {
            throw new ConflictException("homework_not_editable", "Bài tập ở trạng thái hiện tại không thể chỉnh sửa.");
        }
        EnsureVersion(assignment, request.Version);
        if (request.DueAt <= assignment.AssignedAt)
        {
            throw new ConflictException("invalid_homework_due_at", "Hạn hoàn thành phải sau thời điểm giao bài.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        assignment.Title = request.Title.Trim();
        assignment.CoachNote = Clean(request.CoachNote);
        assignment.DueAt = request.DueAt;
        assignment.Version++;
        db.Set<HomeworkAssignmentItem>().RemoveRange(assignment.Items);
        AddItems(assignment.AssignmentId, request.Items);
        audit.Write(new AuditEntry(coachId, "UPDATE_HOMEWORK", nameof(HomeworkAssignment), assignmentId.ToString()));
        await SaveAsync(ct);
        await transaction.CommitAsync(ct);
        return await GetAsync(assignmentId, ct);
    }

    public async Task<HomeworkResponse> UpdateByMemberAsync(
        Guid assignmentId, UpdateMemberHomeworkRequest request, Guid memberId, CancellationToken ct = default)
    {
        var assignment = await db.Set<HomeworkAssignment>().SingleOrDefaultAsync(
            a => a.AssignmentId == assignmentId, ct)
            ?? throw new NotFoundException("homework_not_found", "Không tìm thấy bài tập về nhà.");
        if (assignment.MemberId != memberId)
            throw new ForbiddenException("homework_not_owned", "Bài tập này không thuộc về bạn.");
        EnsureVersion(assignment, request.Version);
        if (request.Status is not (HomeworkAssignmentStatus.InProgress or HomeworkAssignmentStatus.Completed))
            throw new ConflictException("invalid_homework_member_status", "Hội viên chỉ được cập nhật Đang làm hoặc Hoàn thành.");

        var valid = assignment.Status == request.Status
                    || assignment.Status == HomeworkAssignmentStatus.Assigned
                    || assignment.Status == HomeworkAssignmentStatus.InProgress
                       && request.Status == HomeworkAssignmentStatus.Completed;
        if (!valid)
            throw new ConflictException("invalid_homework_transition", "Không thể chuyển bài tập sang trạng thái này.");

        var previousStatus = assignment.Status;
        assignment.Status = request.Status;
        assignment.MemberFeedback = Clean(request.MemberFeedback);
        if (request.Status == HomeworkAssignmentStatus.Completed
            && previousStatus != HomeworkAssignmentStatus.Completed)
        {
            assignment.CompletedAt ??= clock.UtcNow;
            notifications.Queue(new NotificationRequest(
                assignment.CoachId, NotificationEvents.HomeworkStatusChanged,
                $"Hội viên đã hoàn thành bài tập: {assignment.Title}.", assignment.AssignmentId));
        }
        assignment.Version++;
        audit.Write(new AuditEntry(memberId, "UPDATE_HOMEWORK_PROGRESS", nameof(HomeworkAssignment), assignmentId.ToString()));
        await SaveAsync(ct);
        return await GetAsync(assignmentId, ct);
    }

    public async Task<HomeworkResponse> ReviewAsync(
        Guid assignmentId, ReviewHomeworkRequest request, Guid coachId, CancellationToken ct = default)
    {
        var assignment = await OwnedByCoach(assignmentId, coachId, false, ct);
        EnsureVersion(assignment, request.Version);
        if (assignment.Status != HomeworkAssignmentStatus.Completed)
            throw new ConflictException("homework_not_completed", "Chỉ bài tập đã hoàn thành mới có thể duyệt.");
        assignment.Status = HomeworkAssignmentStatus.Reviewed;
        assignment.ReviewedAt = clock.UtcNow;
        assignment.Version++;
        notifications.Queue(new NotificationRequest(
            assignment.MemberId, NotificationEvents.HomeworkStatusChanged,
            $"PT đã duyệt bài tập: {assignment.Title}.", assignment.AssignmentId));
        audit.Write(new AuditEntry(coachId, "REVIEW_HOMEWORK", nameof(HomeworkAssignment), assignmentId.ToString()));
        await SaveAsync(ct);
        return await GetAsync(assignmentId, ct);
    }

    public async Task<HomeworkResponse> CancelAsync(
        Guid assignmentId, Guid coachId, CancellationToken ct = default)
    {
        var assignment = await OwnedByCoach(assignmentId, coachId, false, ct);
        if (assignment.Status == HomeworkAssignmentStatus.Cancelled) return await GetAsync(assignmentId, ct);
        if (assignment.Status is HomeworkAssignmentStatus.Completed or HomeworkAssignmentStatus.Reviewed)
            throw new ConflictException("homework_not_cancellable", "Bài tập đã hoàn thành hoặc duyệt không thể hủy.");
        assignment.Status = HomeworkAssignmentStatus.Cancelled;
        assignment.Version++;
        notifications.Queue(new NotificationRequest(
            assignment.MemberId, NotificationEvents.HomeworkStatusChanged,
            $"PT đã hủy bài tập: {assignment.Title}.", assignment.AssignmentId));
        audit.Write(new AuditEntry(coachId, "CANCEL_HOMEWORK", nameof(HomeworkAssignment), assignmentId.ToString()));
        await SaveAsync(ct);
        return await GetAsync(assignmentId, ct);
    }

    private async Task<HomeworkAssignment> OwnedByCoach(
        Guid assignmentId, Guid coachId, bool includeItems, CancellationToken ct)
    {
        IQueryable<HomeworkAssignment> query = db.Set<HomeworkAssignment>();
        if (includeItems) query = query.Include(a => a.Items);
        var assignment = await query.SingleOrDefaultAsync(a => a.AssignmentId == assignmentId, ct)
            ?? throw new NotFoundException("homework_not_found", "Không tìm thấy bài tập về nhà.");
        if (assignment.CoachId != coachId)
            throw new ForbiddenException("homework_not_owned", "Bạn không sở hữu bài tập này.");
        return assignment;
    }

    private async Task<HomeworkResponse> GetAsync(Guid assignmentId, CancellationToken ct)
        => await db.Set<HomeworkAssignment>().AsNoTracking().Where(a => a.AssignmentId == assignmentId)
               .Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("homework_not_found", "Không tìm thấy bài tập về nhà.");

    private void AddItems(Guid assignmentId, IEnumerable<SaveHomeworkItemRequest> items)
    {
        foreach (var item in items)
            db.Set<HomeworkAssignmentItem>().Add(new HomeworkAssignmentItem
            {
                ItemId = Guid.NewGuid(), AssignmentId = assignmentId,
                Exercise = item.Exercise.Trim(), Sets = item.Sets, Reps = item.Reps, Notes = Clean(item.Notes)
            });
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("homework_version_conflict", "Bài tập đã được cập nhật ở nơi khác.");
        }
    }

    private static void EnsureVersion(HomeworkAssignment assignment, int version)
    {
        if (assignment.Version != version)
            throw new ConflictException("homework_version_conflict", "Bài tập đã được cập nhật ở nơi khác.");
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static (int Page, int PageSize) NormalizePage(int page, int pageSize)
        => (Math.Clamp(page, 1, 100_000),
            Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize));

    private static System.Linq.Expressions.Expression<Func<HomeworkAssignment, HomeworkResponse>> Projection()
        => a => new HomeworkResponse(
            a.AssignmentId, a.MemberId,
            a.Member!.Profile != null ? a.Member.Profile.FullName : a.Member.Email,
            a.CoachId, a.Coach!.Profile != null ? a.Coach.Profile.FullName : a.Coach.Email,
            a.RelationshipId, a.SourceWorkoutPlanId, a.Title, a.CoachNote,
            a.AssignedAt, a.DueAt, a.CompletedAt, a.ReviewedAt, a.Status, a.MemberFeedback, a.Version,
            a.Items.Select(i => new HomeworkItemResponse(i.ItemId, i.Exercise, i.Sets, i.Reps, i.Notes)).ToList());
}
