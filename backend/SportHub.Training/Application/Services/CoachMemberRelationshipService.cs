using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Quan hệ huấn luyện Coach–Member — nền tảng phân quyền của BR-23 (ai được lập kế hoạch tập).
///
/// Manager creates/ends assignments through the existing API. Every assignment requires a
/// confirmed enrollment in a current class led by that coach, including manually assigned pairs.
/// </summary>
public sealed class CoachMemberRelationshipService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : ICoachMemberRelationshipService, ICoachMemberAccessReader
{
    public Task<bool> HasActiveRelationshipAsync(Guid coachId, Guid memberId, CancellationToken ct = default)
        => SportHub.Scheduling.Application.Services.CoachDataScope.CanReadMemberAsync(db, coachId, memberId, ct);

    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;

    public async Task<IReadOnlyList<CoachMemberRelationshipResponse>> SearchAsync(
        Guid? coachId,
        Guid? memberId,
        bool activeOnly,
        int page,
        int pageSize,
        CancellationToken ct = default, bool currentClassesOnly = false)
    {
        var query = db.Set<CoachMemberRelationship>().AsNoTracking();
        if (currentClassesOnly && coachId.HasValue) {
            var enrollments = SportHub.Scheduling.Application.Services.CoachDataScope.Enrollments(db, coachId.Value);
            query = query.Where(r => enrollments.Any(e => e.MemberId == r.MemberId));
        }

        if (coachId is not null)
        {
            query = query.Where(r => r.CoachId == coachId);
        }

        if (memberId is not null)
        {
            query = query.Where(r => r.MemberId == memberId);
        }

        if (activeOnly)
        {
            query = query.Where(r => r.Status == RelationshipStatus.Active
                    && db.Set<Enrollment>().Any(e => e.MemberId == r.MemberId
                        && e.Status == EnrollmentStatus.Confirmed && e.Class != null
                        && e.Class.CoachId == r.CoachId
                        && (e.Class.Status == ClassStatus.Published || e.Class.Status == ClassStatus.InProgress)));
        }

        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize);
        var rows = await query.OrderByDescending(r => r.StartedAt).ThenBy(r => r.RelationshipId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(Projection()).ToListAsync(ct);
        return await WithClassesAsync(rows, ct);
    }

    public async Task<CoachMemberRelationshipResponse> CreateAsync(
        CreateRelationshipRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<RelationshipSourceType>(request.SourceType, ignoreCase: true, out var sourceType))
        {
            throw new BadRequestException(
                "invalid_source_type",
                "Invalid source type.");
        }

        // ClassBased là HỆ QUẢ của việc đăng ký lớp, không phải thao tác tạo tay: nếu nhận qua
        // API thì sẽ có quan hệ ClassBased mà không có lớp nào ở sau nó.
        if (sourceType == RelationshipSourceType.ClassBased)
        {
            throw new BadRequestException(
                "class_based_is_automatic",
                "Class based is automatic.");
        }
        if (sourceType != RelationshipSourceType.AssignedByManager)
        {
            throw new BadRequestException(
                "invalid_source_type",
                "Only class-based manager assignments are supported.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock_shared(105, 1)", ct);
        // Take class locks before the pair lock, matching enrollment fulfillment's order.
        // Cancellation, reassignment and lifecycle updates cannot remove our last class
        // between validation and inserting the manual assignment.
        var supportingClasses = await db.Set<Class>().FromSqlInterpolated($"""
            SELECT c.* FROM classes c
            WHERE c.coach_id = {request.CoachId}
              AND c.status IN ({(int)ClassStatus.Published}, {(int)ClassStatus.InProgress})
              AND EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = c.class_id
                AND e.member_id = {request.MemberId} AND e.status = {(int)EnrollmentStatus.Confirmed})
            ORDER BY c.class_id FOR SHARE OF c
            """).AsNoTracking().ToListAsync(ct);
        await LockPairAsync(request.CoachId, request.MemberId, ct);
        await EnsureRoleAsync(request.CoachId, UserRole.Coach, "coach_not_found", ct);
        await EnsureRoleAsync(request.MemberId, UserRole.Member, "member_not_found", ct);
        if (supportingClasses.Count == 0 || !await CoachDataScope.CanReadMemberAsync(db, request.CoachId, request.MemberId, ct))
            throw new ConflictException("relationship_requires_active_class",
                "The coach and member must share a current course with confirmed enrollment.");

        // Ràng buộc #7 / BR-23: tối đa một quan hệ Active cho mỗi cặp. Partial unique index
        // trong DB là nơi chặn thật; kiểm ở đây để trả lỗi có nghĩa.
        var existing = await db.Set<CoachMemberRelationship>().AnyAsync(
            r => r.CoachId == request.CoachId
                 && r.MemberId == request.MemberId
                 && r.Status == RelationshipStatus.Active,
            ct);

        if (existing)
        {
            throw new ConflictException(
                "relationship_already_active", "Relationship already active.");
        }

        var relationship = new CoachMemberRelationship
        {
            RelationshipId = Guid.NewGuid(),
            CoachId = request.CoachId,
            MemberId = request.MemberId,
            SourceType = sourceType,
            ClassId = null,
            Status = RelationshipStatus.Active,
            StartedAt = clock.UtcNow
        };

        db.Set<CoachMemberRelationship>().Add(relationship);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_COACH_MEMBER_RELATIONSHIP", nameof(CoachMemberRelationship),
            relationship.RelationshipId.ToString(),
            NewValue: $"{{\"coachId\":\"{request.CoachId}\",\"memberId\":\"{request.MemberId}\","
                      + $"\"sourceType\":\"{sourceType}\"}}", Reason: request.Note?.Trim()));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetOneAsync(relationship.RelationshipId, ct);
    }

    public async Task<CoachMemberRelationshipResponse> EndAsync(
        Guid relationshipId,
        string reason,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("relationship_end_reason_required", "Provide a reason with 3 to 500 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var relationship = await db.Set<CoachMemberRelationship>()
            .FromSqlInterpolated($"SELECT * FROM coach_member_relationships WHERE relationship_id = {relationshipId} FOR UPDATE")
            .SingleOrDefaultAsync(r => r.RelationshipId == relationshipId, ct)
            ?? throw new NotFoundException("relationship_not_found", "Relationship not found.");

        if (relationship.Status == RelationshipStatus.Ended)
        {
            throw new ConflictException("relationship_already_ended", "Relationship already ended.");
        }

        relationship.Status = RelationshipStatus.Ended;
        relationship.EndedAt = clock.UtcNow;
        relationship.EndReason = reason.Trim();

        // Preserve plans and training history. Ending this row does not cancel enrollment or
        // change the schedule; current class assignments still govern class workspace access.
        audit.Write(new AuditEntry(
            actorUserId, "END_COACH_MEMBER_RELATIONSHIP", nameof(CoachMemberRelationship), relationshipId.ToString(),
            OldValue: $"{{\"status\":\"{RelationshipStatus.Active}\"}}",
            NewValue: $"{{\"status\":\"{RelationshipStatus.Ended}\"}}", Reason: reason.Trim()));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetOneAsync(relationshipId, ct);
    }

    /// <summary>
    /// Quan hệ ClassBased do hệ thống tự tạo khi hội viên có đăng ký xác nhận vào lớp của HLV
    /// đó. Không có endpoint tương ứng — đây là hệ quả của việc đăng ký, không phải thao tác
    /// người dùng. Quyền đọc của quan hệ này luôn xét lại ghi danh và phân công lớp đang hiệu lực;
    /// dòng quan hệ còn lưu để đối soát nhưng không cấp quyền sau khi lớp/ghi danh kết thúc.
    /// </summary>
    public async Task EnsureClassBasedAsync(
        Guid coachId,
        Guid memberId,
        int classId,
        CancellationToken ct = default)
    {
        await LockPairAsync(coachId, memberId, ct);
        var active = await db.Set<CoachMemberRelationship>().FromSqlInterpolated($"""
            SELECT * FROM coach_member_relationships
            WHERE coach_id = {coachId} AND member_id = {memberId} AND status = {(int)RelationshipStatus.Active}
            FOR UPDATE
            """).AsNoTracking().ToListAsync(ct);

        if (active.Count > 0)
        {
            return;
        }

        db.Set<CoachMemberRelationship>().Add(new CoachMemberRelationship
        {
            RelationshipId = Guid.NewGuid(),
            CoachId = coachId,
            MemberId = memberId,
            SourceType = RelationshipSourceType.ClassBased,
            ClassId = classId,
            Status = RelationshipStatus.Active,
            StartedAt = clock.UtcNow
        });
    }

    private Task LockPairAsync(Guid coachId, Guid memberId, CancellationToken ct)
        => db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"coach-member:{coachId}:{memberId}"}, 0))", ct);

    public async Task ReconcileAsync(Guid? memberId, Guid? coachId, Guid? actorUserId, string reason,
        CancellationToken cancellationToken = default)
    {
        // Callers persist their enrollment/class changes first. Row locks keep cleanup, manual ending
        // and concurrent cleanup atomic; a second current class always keeps the pair alive.
        await using var ownedTx = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        var stale = await db.Set<CoachMemberRelationship>().FromSqlInterpolated($"""
            SELECT r.* FROM coach_member_relationships r
            WHERE r.status = {(int)RelationshipStatus.Active}
              AND ({memberId}::uuid IS NULL OR r.member_id = {memberId})
              AND ({coachId}::uuid IS NULL OR r.coach_id = {coachId})
              AND NOT EXISTS (
                SELECT 1 FROM enrollments e JOIN classes c ON c.class_id = e.class_id
                WHERE e.member_id = r.member_id AND c.coach_id = r.coach_id
                  AND e.status = {(int)EnrollmentStatus.Confirmed}
                  AND c.status IN ({(int)ClassStatus.Published}, {(int)ClassStatus.InProgress}))
            ORDER BY r.relationship_id FOR UPDATE OF r
            """).ToListAsync(cancellationToken);
        foreach (var row in stale)
        {
            await db.Entry(row).ReloadAsync(cancellationToken);
            if (row.Status != RelationshipStatus.Active
                || await CoachDataScope.CanReadMemberAsync(db, row.CoachId, row.MemberId, cancellationToken)) continue;
            row.Status = RelationshipStatus.Ended;
            row.EndedAt = clock.UtcNow;
            row.EndReason = reason;
            audit.Write(new AuditEntry(actorUserId ?? row.CoachId, "AUTO_END_COACH_MEMBER_RELATIONSHIP",
                nameof(CoachMemberRelationship), row.RelationshipId.ToString(),
                OldValue: "{\"status\":\"Active\"}", NewValue: "{\"status\":\"Ended\"}",
                Reason: reason, IsSystem: actorUserId is null));
        }
        await db.SaveChangesAsync(cancellationToken);
        if (ownedTx is not null) await ownedTx.CommitAsync(cancellationToken);
    }

    private async Task EnsureRoleAsync(Guid userId, UserRole role, string errorCode, CancellationToken ct)
    {
        var ok = await db.Set<UserAccount>().AnyAsync(u => u.UserId == userId && u.Role!.RoleName == role
            && u.Status == UserStatus.Active, ct);

        if (!ok)
        {
            throw new BadRequestException(errorCode, $"The account does not exist or does not have the {role} role.");
        }
    }

    private async Task<CoachMemberRelationshipResponse> GetOneAsync(Guid relationshipId, CancellationToken ct)
    {
        var row = await db.Set<CoachMemberRelationship>().AsNoTracking()
               .Where(r => r.RelationshipId == relationshipId).Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("relationship_not_found", "Relationship not found.");
        return (await WithClassesAsync([row], ct))[0];
    }

    private async Task<IReadOnlyList<CoachMemberRelationshipResponse>> WithClassesAsync(
        IReadOnlyList<CoachMemberRelationshipResponse> rows, CancellationToken ct)
    {
        var memberIds = rows.Where(r => r.Status == nameof(RelationshipStatus.Active)).Select(r => r.MemberId).Distinct().ToArray();
        var coachIds = rows.Select(r => r.CoachId).Distinct().ToArray();
        var courses = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => memberIds.Contains(e.MemberId) && e.Status == EnrollmentStatus.Confirmed
                && e.Class != null && e.Class.CoachId != null && coachIds.Contains(e.Class.CoachId.Value)
                && (e.Class.Status == ClassStatus.Published || e.Class.Status == ClassStatus.InProgress))
            .Select(e => new { e.MemberId, CoachId = e.Class!.CoachId!.Value, e.ClassId, ClassName = e.Class.Name })
            .Distinct().OrderBy(e => e.ClassName).ToListAsync(ct);
        return rows.Select(row => row with { ActiveClasses = courses
            .Where(c => row.Status == nameof(RelationshipStatus.Active) && c.MemberId == row.MemberId && c.CoachId == row.CoachId)
            .Select(c => new RelationshipClassResponse(c.ClassId, c.ClassName)).ToArray() }).ToArray();
    }

    private static System.Linq.Expressions.Expression<Func<CoachMemberRelationship, CoachMemberRelationshipResponse>>
        Projection()
        => r => new CoachMemberRelationshipResponse(
            r.RelationshipId,
            r.CoachId,
            r.Coach!.Profile != null ? r.Coach.Profile.FullName : r.Coach.Email,
            r.MemberId,
            r.Member!.Email,
            r.Member.Profile != null ? r.Member.Profile.FullName : string.Empty,
            r.SourceType.ToString(),
            r.ClassId,
            r.Class == null ? null : r.Class.Name,
            r.Status.ToString(),
            r.StartedAt,
            r.EndedAt,
            r.EndReason,
            null);
}
