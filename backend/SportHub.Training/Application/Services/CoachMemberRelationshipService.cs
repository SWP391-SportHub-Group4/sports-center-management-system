using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Services;

public interface ICoachMemberRelationshipService : ICoachRelationshipRegistrar
{
    Task<IReadOnlyList<CoachMemberRelationshipDto>> SearchAsync(
        Guid? coachId, Guid? memberId, bool activeOnly, CancellationToken ct = default);

    Task<CoachMemberRelationshipDto> CreateAsync(
        CreateRelationshipRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<CoachMemberRelationshipDto> EndAsync(
        Guid relationshipId, string reason, Guid actorUserId, CancellationToken ct = default);

    // EnsureClassBasedAsync kế thừa từ ICoachRelationshipRegistrar: module Scheduling gọi qua
    // abstraction đó khi hội viên đăng ký lớp, không tham chiếu trực tiếp module Training.
}

/// <summary>
/// Quan hệ huấn luyện Coach–Member — nền tảng phân quyền của BR-23 (ai được lập kế hoạch tập).
///
/// Ai được tạo/kết thúc quan hệ KHÔNG có BR trực tiếp: quyết định C3 (CẦN DUYỆT) đặt quyền
/// này ở Center Manager, khớp BR-14 ("phân công huấn luyện viên"). Coach KHÔNG tự tạo quan hệ
/// với hội viên bất kỳ — làm vậy là tự cấp cho mình quyền đọc hồ sơ và ghi kế hoạch tập.
/// </summary>
public sealed class CoachMemberRelationshipService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : ICoachMemberRelationshipService
{
    public async Task<IReadOnlyList<CoachMemberRelationshipDto>> SearchAsync(
        Guid? coachId,
        Guid? memberId,
        bool activeOnly,
        CancellationToken ct = default)
    {
        var query = db.Set<CoachMemberRelationship>().AsNoTracking();

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
            query = query.Where(r => r.Status == RelationshipStatus.Active);
        }

        return await query.OrderByDescending(r => r.StartedAt).Select(Projection()).ToListAsync(ct);
    }

    public async Task<CoachMemberRelationshipDto> CreateAsync(
        CreateRelationshipRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<RelationshipSourceType>(request.SourceType, ignoreCase: true, out var sourceType))
        {
            throw new BadRequestException(
                "invalid_source_type",
                $"Loại quan hệ không hợp lệ: '{request.SourceType}'. Hợp lệ: Personal, AssignedByManager.");
        }

        // ClassBased là HỆ QUẢ của việc đăng ký lớp, không phải thao tác tạo tay: nếu nhận qua
        // API thì sẽ có quan hệ ClassBased mà không có lớp nào ở sau nó.
        if (sourceType == RelationshipSourceType.ClassBased)
        {
            throw new BadRequestException(
                "class_based_is_automatic",
                "Quan hệ ClassBased do hệ thống tự tạo khi hội viên đăng ký lớp của HLV đó.");
        }

        await EnsureRoleAsync(request.CoachId, UserRole.Coach, "coach_not_found", ct);
        await EnsureRoleAsync(request.MemberId, UserRole.Member, "member_not_found", ct);

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
                "relationship_already_active", "Cặp HLV–Hội viên này đã có quan hệ huấn luyện đang hoạt động.");
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
                      + $"\"sourceType\":\"{sourceType}\"}}",
            Reason: request.Note?.Trim()));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(relationship.RelationshipId, ct);
    }

    public async Task<CoachMemberRelationshipDto> EndAsync(
        Guid relationshipId,
        string reason,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var relationship = await db.Set<CoachMemberRelationship>()
            .SingleOrDefaultAsync(r => r.RelationshipId == relationshipId, ct)
            ?? throw new NotFoundException("relationship_not_found", "Không tìm thấy quan hệ huấn luyện.");

        if (relationship.Status == RelationshipStatus.Ended)
        {
            throw new ConflictException("relationship_already_ended", "Quan hệ huấn luyện đã kết thúc.");
        }

        relationship.Status = RelationshipStatus.Ended;
        relationship.EndedAt = clock.UtcNow;

        // Kế hoạch tập đã lập KHÔNG bị xoá: BR-25 cho hội viên xem lại kế hoạch của mình, và
        // lịch sử huấn luyện là dữ liệu cần giữ. Chỉ chặn việc lập kế hoạch MỚI (BR-23).
        audit.Write(new AuditEntry(
            actorUserId, "END_COACH_MEMBER_RELATIONSHIP", nameof(CoachMemberRelationship), relationshipId.ToString(),
            OldValue: $"{{\"status\":\"{RelationshipStatus.Active}\"}}",
            NewValue: $"{{\"status\":\"{RelationshipStatus.Ended}\"}}",
            Reason: reason.Trim()));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(relationshipId, ct);
    }

    /// <summary>
    /// Quan hệ ClassBased do hệ thống tự tạo khi hội viên có đăng ký xác nhận vào lớp của HLV
    /// đó. Không có endpoint tương ứng — đây là hệ quả của việc đăng ký, không phải thao tác
    /// người dùng. Không tự kết thúc quan hệ khi hội viên thôi học lớp: không BR nào nói khi nào
    /// quan hệ ClassBased chấm dứt (quyết định C3).
    /// </summary>
    public async Task EnsureClassBasedAsync(
        Guid coachId,
        Guid memberId,
        int classId,
        CancellationToken ct = default)
    {
        var exists = await db.Set<CoachMemberRelationship>().AnyAsync(
            r => r.CoachId == coachId && r.MemberId == memberId && r.Status == RelationshipStatus.Active, ct);

        if (exists)
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

    private async Task EnsureRoleAsync(Guid userId, UserRole role, string errorCode, CancellationToken ct)
    {
        var ok = await db.Set<UserAccount>().AnyAsync(u => u.UserId == userId && u.Role!.RoleName == role, ct);

        if (!ok)
        {
            throw new BadRequestException(errorCode, $"Tài khoản không tồn tại hoặc không có vai trò {role}.");
        }
    }

    private async Task<CoachMemberRelationshipDto> GetOneAsync(Guid relationshipId, CancellationToken ct)
        => await db.Set<CoachMemberRelationship>().AsNoTracking()
               .Where(r => r.RelationshipId == relationshipId).Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("relationship_not_found", "Không tìm thấy quan hệ huấn luyện.");

    private static System.Linq.Expressions.Expression<Func<CoachMemberRelationship, CoachMemberRelationshipDto>>
        Projection()
        => r => new CoachMemberRelationshipDto(
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
            r.EndedAt);
}
