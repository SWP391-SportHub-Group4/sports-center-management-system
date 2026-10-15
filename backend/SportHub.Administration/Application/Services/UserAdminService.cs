using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Administration.Application.Services;

/// <summary>
/// Thao tác quản trị tài khoản — BR-2 (tạo tài khoản nhân sự, gán/đổi vai trò),
/// BR-6 (khoá/mở khoá), BR-7 (ghi Audit Log kèm lý do).
///
/// Policy ở controller đã chặn role; service vẫn kiểm các ràng buộc nghiệp vụ mà policy
/// không biết (tự khoá mình, khoá SysAdmin cuối cùng), vì đó là dữ liệu chứ không phải vai trò.
/// </summary>
public sealed class UserAdminService(
    ISportHubDbContext db,
    EmailOtpFlow otpFlow,
    CoachSpecialtyService specialties,
    IAuditWriter audit,
    INotificationWriter notifications,
    IClock clock,
    ActivationLinkService activationLinks,
    IStaffInvitationExpiryReader invitationExpiry) : IUserAdminService
{
    public async Task<PagedResult<UserAdminResponse>> SearchAsync(
        string? keyword,
        string? role,
        string? status,
        int page,
        int pageSize,
        CancellationToken ct = default,
        string? sortBy = null,
        string? sortDirection = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var query = db.Set<UserAccount>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            // ToLower().Contains() chứ không phải EF.Functions.ILike: ILike là hàm riêng của
            // provider Npgsql và module nghiệp vụ chỉ tham chiếu EF Core Relational.
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(u =>
                u.Email.ToLower().Contains(term)
                || (u.Profile != null && u.Profile.FullName.ToLower().Contains(term))
                || (u.Profile != null && u.Profile.Phone != null && u.Profile.Phone.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            var parsedRole = ParseRole(role);
            query = query.Where(u => u.Role!.RoleName == parsedRole);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (status == "ACTIVATION_REQUIRED")
            {
                query = query.Where(u => u.Status == UserStatus.Active
                    && u.Role!.RoleName != UserRole.Member
                    && (u.Credential == null || u.Credential.PasswordHash == null)
                    && !u.ExternalLogins.Any());
            }
            else
            {
                var parsedStatus = ParseStatus(status);
                query = query.Where(u => u.Status == parsedStatus);
            }
        }

        var column = string.IsNullOrWhiteSpace(sortBy) ? "email" : sortBy;
        var direction = string.IsNullOrWhiteSpace(sortDirection) ? "asc" : sortDirection;
        if (direction is not ("asc" or "desc"))
            throw new BadRequestException("invalid_sort_direction", "Sort direction must be asc or desc.");
        var descending = direction == "desc";
        IOrderedQueryable<UserAccount> ordered = column switch
        {
            "email" => descending ? query.OrderByDescending(u => u.Email) : query.OrderBy(u => u.Email),
            "fullName" => descending ? query.OrderByDescending(u => u.Profile != null ? u.Profile.FullName : u.Email)
                : query.OrderBy(u => u.Profile != null ? u.Profile.FullName : u.Email),
            "role" => descending ? query.OrderByDescending(u => u.Role!.RoleName) : query.OrderBy(u => u.Role!.RoleName),
            "status" => descending ? query.OrderByDescending(u => u.Status) : query.OrderBy(u => u.Status),
            _ => throw new BadRequestException("invalid_sort_column", "Unsupported account sort column.")
        };
        var total = await query.CountAsync(ct);

        var items = await ordered
            .ThenBy(u => u.UserId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(Projection())
            .ToListAsync(ct);

        return new PagedResult<UserAdminResponse>
        {
            Items = await WithSportsAsync(items, ct),
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<UserAdminResponse> GetAsync(Guid userId, CancellationToken ct = default)
    {
        var row = await db.Set<UserAccount>()
                      .AsNoTracking()
                      .Where(u => u.UserId == userId)
                      .Select(Projection())
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("user_not_found", "User not found.");

        return (await WithSportsAsync([row], ct))[0];
    }

    public async Task<UserAdminResponse> CreateStaffAsync(
        CreateStaffAccountRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var role = await db.Set<Role>().SingleOrDefaultAsync(r => r.RoleId == request.RoleId, ct)
            ?? throw new BadRequestException("invalid_role", "Invalid staff role.");
        var targetRole = role.RoleName;

        // BR-1: Hội viên TỰ đăng ký. BR-2 liệt kê đúng 4 vai trò mà SysAdmin được tạo và
        // Member không nằm trong đó — nên endpoint này từ chối tạo Member thay vì lặng lẽ cho qua.
        if (targetRole == UserRole.Member)
        {
            throw new BadRequestException(
                "member_must_self_register",
                "Member must self register.");
        }

        var email = request.Email.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();

        if (await db.Set<UserAccount>().AnyAsync(u => u.Email == email, ct))
        {
            throw new ConflictException("email_already_exists", "Email already exists.");
        }

        if (phone is not null && await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
        {
            throw new ConflictException("phone_already_exists", "Phone already exists.");
        }

        // BR-96 — khi Admin tạo Coach phải chọn đúng một môn đang hoạt động. Role khác không
        // được nhận môn chuyên môn để tránh dữ liệu mơ hồ.
        IReadOnlyList<int>? coachSportIds = null;

        if (targetRole == UserRole.Coach)
        {
            coachSportIds = await specialties.ValidateAsync(request.Specialties, ct);
            if (coachSportIds.Count != 1)
                throw new BadRequestException(
                    "coach_single_specialty_required", "Select exactly one sport specialty when creating a coach.");
        }
        else if (request.Specialties is { Count: > 0 })
        {
            throw new BadRequestException(
                "sport_ids_not_applicable", "Sport ids not applicable.");
        }

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow,
            Credential = new UserCredential { PasswordHash = null },
            Profile = new UserProfile { FullName = request.FullName.Trim(), Phone = phone },
            CoachProfile = coachSportIds is not null ? new CoachProfile() : null
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        db.Set<UserAccount>().Add(user);

        if (coachSportIds is not null)
        {
            await specialties.ReplaceAsync(user.UserId, coachSportIds, ct);
        }

        audit.Write(new AuditEntry(
            actorUserId,
            AccountAuditActions.CreateStaffAccount,
            nameof(UserAccount),
            user.UserId.ToString(),
            OldValue: null,
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                email,
                role = targetRole.ToString(),
                sportIds = coachSportIds
            })));

        if (!await IssueActivationLinkAsync(email, request.FullName.Trim(), user.CreatedAt, ct))
            throw new InvalidOperationException("Could not issue a staff activation link.");

        // EmailOtpFlow saves the account, specialties, audit, token hash and encrypted outbox row together.
        await tx.CommitAsync(ct);

        return await GetAsync(user.UserId, ct);
    }

    /// <summary>Gửi link hết hạn đúng CreatedAt + 24 giờ; link mới vô hiệu link cũ. False nếu còn trong thời gian chờ gửi lại.</summary>
    private Task<bool> IssueActivationLinkAsync(string email, string fullName, DateTime createdAtUtc, CancellationToken ct)
        => activationLinks.IssueAsync(email, fullName, member: false, ct,
            expiresAtUtc: createdAtUtc + StaffInvitationExpiryService.InvitationLifetime);

    private async Task<UserAccount> LoadPendingStaffAsync(Guid userId, CancellationToken ct)
    {
        _ = await db.Set<UserAccount>()
            .FromSqlInterpolated($"SELECT * FROM user_accounts WHERE user_id = {userId} FOR UPDATE")
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("user_not_found", "User not found.");
        var user = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .Include(u => u.Profile)
            .Include(u => u.Credential)
            .Include(u => u.ExternalLogins)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "User not found.");

        if (user.Role!.RoleName == UserRole.Member
            || !string.IsNullOrEmpty(user.Credential?.PasswordHash)
            || user.ExternalLogins.Count > 0)
        {
            throw new ConflictException("account_not_pending_activation", "Only staff accounts that are waiting for activation can do this.");
        }

        if (await invitationExpiry.IsExpiredAsync(user.UserId, user.CreatedAt, clock.UtcNow, ct))
            throw new ConflictException("staff_invitation_expired", "The staff activation invitation has expired.");

        return user;
    }

    public async Task<UserAdminResponse> ResendActivationAsync(Guid userId, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await LoadPendingStaffAsync(userId, ct);

        audit.Write(new AuditEntry(actorUserId, AccountAuditActions.ResendStaffActivation, nameof(UserAccount), userId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { email = user.Email })));

        if (!await IssueActivationLinkAsync(user.Email, user.Profile?.FullName ?? string.Empty, user.CreatedAt, ct))
            throw new AppException(StatusCodes.Status429TooManyRequests, "activation_resend_too_soon",
                $"Wait {AuthService.OtpResendCooldown.TotalSeconds:0} seconds before sending another activation link.");

        await tx.CommitAsync(ct);
        return await GetAsync(userId, ct);
    }

    /// <summary>Sửa email của tài khoản staff chưa kích hoạt (gõ sai/nhầm người nhận): link cũ bị vô hiệu, link mới gửi tới email mới.</summary>
    public async Task<UserAdminResponse> ChangePendingEmailAsync(
        Guid userId, ChangePendingStaffEmailRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await LoadPendingStaffAsync(userId, ct);
        var oldEmail = user.Email;
        var newEmail = request.Email.Trim();
        if (request.Reason.Trim().Length < 3)
            throw new BadRequestException("invalid_reason", "Enter a reason with at least 3 characters.");

        if (string.Equals(oldEmail, newEmail, StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("email_unchanged", "The new email is the same as the current email.");

        var lowered = newEmail.ToLowerInvariant();
        if (await db.Set<UserAccount>().AnyAsync(u => u.UserId != userId && u.Email.ToLower() == lowered, ct))
            throw new ConflictException("email_already_exists", "Email already exists.");

        // Link đã gửi tới email cũ không được dùng nữa, kể cả khi người nhận nhầm đang giữ nó.
        await otpFlow.DiscardAsync(oldEmail, EmailOtpPurpose.ResetPassword);
        user.Email = newEmail;
        audit.Write(new AuditEntry(actorUserId, AccountAuditActions.ChangePendingStaffEmail, nameof(UserAccount), userId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { email = oldEmail }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { email = newEmail }),
            Reason: request.Reason.Trim()));

        if (!await IssueActivationLinkAsync(newEmail, user.Profile?.FullName ?? string.Empty, user.CreatedAt, ct))
            throw new AppException(StatusCodes.Status429TooManyRequests, "activation_resend_too_soon",
                $"Wait {AuthService.OtpResendCooldown.TotalSeconds:0} seconds before sending another activation link.");

        await tx.CommitAsync(ct);
        return await GetAsync(userId, ct);
    }

    public async Task<UserAdminResponse> ChangeRoleAsync(
        Guid userId,
        ChangeUserRoleRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var targetRole = ParseRole(request.Role);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize role changes so an account promoted to Administrator cannot be demoted by a stale request.
        _ = await db.Set<UserAccount>()
            .FromSqlInterpolated($"SELECT * FROM user_accounts WHERE user_id = {userId} FOR UPDATE")
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("user_not_found", "User not found.");

        var user = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .Include(u => u.CoachProfile)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "User not found.");

        var currentRole = user.Role!.RoleName;

        if (currentRole == targetRole)
        {
            return await GetAsync(userId, ct);
        }

        if (currentRole == UserRole.SystemAdministrator)
        {
            throw new ConflictException(
                "administrator_role_change_not_allowed",
                "Administrator roles cannot be changed, including your own account and other Administrators.");
        }

        // Member và Staff là hai loại tài khoản tách biệt: không đổi qua lại. Người dùng muốn làm
        // staff phải được tạo tài khoản staff bằng email khác (Admin → Users → Create staff account).
        if ((currentRole == UserRole.Member) != (targetRole == UserRole.Member))
        {
            throw new ConflictException(
                "member_staff_role_change_not_allowed",
                "Member and staff accounts cannot be converted. Create a staff account with a different email.");
        }

        // Coach rời vai trò: chặn khi còn lớp/lịch/quan hệ huấn luyện đang hoạt động.
        if (currentRole == UserRole.Coach)
        {
            var blockers = await CoachBlockersAsync(userId, ct);
            if (blockers.Count > 0) throw new RoleChangeBlockedException(blockers);
        }

        // BR-96, chốt 28/09/2026 (2) (SSOT §7): đổi role VÀO Coach luôn bắt buộc chọn category
        // mới tường minh, kể cả khi tài khoản từng có CoachProfile lịch sử — không tự khôi phục
        // giá trị cũ. Đổi role RA KHỎI Coach thì giữ nguyên CoachProfile làm lịch sử, không sửa,
        // không cascade delete; RoleId hiện tại (khác Coach) là đủ để coi profile hết hiệu lực.
        IReadOnlyList<int>? newSportIds = null;

        if (targetRole == UserRole.Coach)
        {
            newSportIds = await specialties.ValidateAsync(request.SportIds, ct);

            user.CoachProfile ??= new CoachProfile { UserId = userId };
            await specialties.ReplaceAsync(userId, newSportIds, ct);
        }
        else if (request.SportIds is { Count: > 0 })
        {
            throw new BadRequestException(
                "sport_ids_not_applicable", "Sport ids not applicable.");
        }

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == targetRole, ct);

        user.RoleId = role.RoleId;

        // Rời Coach: giữ CoachProfile làm lịch sử, nhưng gỡ chuyên môn để không còn hiệu lực.
        if (currentRole == UserRole.Coach)
        {
            db.Set<UserSportSpecialty>().RemoveRange(await db.Set<UserSportSpecialty>().Where(x => x.UserId == userId).ToListAsync(ct));
        }

        // BR-103/104: đổi vai trò vô hiệu mọi token đang lưu hành (claim sst + role không còn khớp DB).
        user.SecurityStamp = Guid.NewGuid();

        audit.Write(new AuditEntry(
            actorUserId,
            AccountAuditActions.ChangeUserRole,
            nameof(UserAccount),
            userId.ToString(),
            OldValue: $"{{\"role\":\"{currentRole}\"}}",
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { role = targetRole.ToString(), sportIds = newSportIds }),
            Reason: request.Reason.Trim()));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetAsync(userId, ct);
    }

    public async Task<UserAdminResponse> SetStatusAsync(
        Guid userId,
        UserStatus target,
        string reason,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        // BR-6 — không được tự khoá tài khoản của chính mình.
        if (userId == actorUserId && target != UserStatus.Active)
        {
            throw new ForbiddenException(
                "cannot_lock_self",
                "Cannot lock self.");
        }

        var user = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .Include(u => u.Profile)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "User not found.");

        if (user.Status == target)
        {
            return await GetAsync(userId, ct);
        }

        // BR-6 — không khoá System Administrator đang hoạt động cuối cùng.
        if (target != UserStatus.Active && user.Role!.RoleName == UserRole.SystemAdministrator)
        {
            await EnsureNotLastActiveSystemAdministratorAsync(userId, ct);
        }

        var previous = user.Status;
        user.Status = target;
        // A restored account must not revive a token issued before the lock.
        user.SecurityStamp = Guid.NewGuid();

        if (target != UserStatus.Active && user.Role!.RoleName == UserRole.Coach)
        {
            var classCount = await db.Set<Class>().CountAsync(x => x.CoachId == userId
                && x.Status != ClassStatus.Completed && x.Status != ClassStatus.Cancelled, ct);
            var futureSessions = await db.Set<ClassSession>().CountAsync(x => x.CoachId == userId
                && x.Status == ClassSessionStatus.Scheduled && x.StartAtUtc > clock.UtcNow, ct);
            var relationshipCount = await db.Set<CoachMemberRelationship>().CountAsync(x => x.CoachId == userId
                && x.Status == RelationshipStatus.Active, ct);
            if (classCount > 0 || futureSessions > 0 || relationshipCount > 0)
            {
                var managers = await db.Set<UserAccount>().AsNoTracking()
                    .Where(x => x.Status == UserStatus.Active && x.Role!.RoleName == UserRole.CenterManager)
                    .Select(x => new { x.UserId, x.Email }).ToListAsync(ct);
                var message = $"Coach {user.Profile?.FullName ?? user.Email} was locked. {classCount} unfinished classes, "
                    + $"{futureSessions} future sessions and {relationshipCount} active coaching relationships need review. "
                    + "Assign an eligible replacement or reschedule the affected sessions. Open /manager/coach-coverage.";
                foreach (var manager in managers)
                {
                    notifications.Queue(new NotificationRequest(manager.UserId, NotificationEvents.CoachCoverageRequired,
                        message, userId));
                    notifications.QueueEmail(new EmailNotificationRequest(manager.UserId, manager.Email,
                        NotificationEvents.CoachCoverageRequired, userId, "SportHub - Coach coverage required",
                        "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
                }
            }
        }

        audit.Write(new AuditEntry(
            actorUserId,
            target == UserStatus.Active ? AccountAuditActions.UnlockUserAccount : AccountAuditActions.LockUserAccount,
            nameof(UserAccount),
            userId.ToString(),
            OldValue: $"{{\"status\":\"{previous}\"}}",
            NewValue: $"{{\"status\":\"{target}\"}}",

            // BR-7 nêu đích danh: thao tác khoá/mở khoá phải ghi thêm lý do.
            Reason: reason.Trim()));

        await db.SaveChangesAsync(ct);

        // Hiệu lực với token đang lưu hành: hook OnTokenValidated ở SportHub.API đọc lại
        // status trong DB mỗi request, nên tài khoản vừa khoá bị chặn ở request kế tiếp
        // (SSOT §5.6). Request đang chạy dở không bị huỷ; thu hồi token vĩnh viễn là scope riêng.
        return await GetAsync(userId, ct);
    }

    private async Task<List<string>> CoachBlockersAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var reasons = new List<string>();

        var classes = await db.Set<Class>().CountAsync(x => x.CoachId == userId
            && x.Status != ClassStatus.Completed && x.Status != ClassStatus.Cancelled, ct);
        if (classes > 0) reasons.Add($"Still the main coach of {classes} unfinished class(es). Reassign them first.");

        var occupancies = await db.Set<CoachOccupancy>().CountAsync(x => x.CoachId == userId && x.IsActive && x.EndAtUtc > now, ct);
        if (occupancies > 0) reasons.Add($"{occupancies} upcoming class session(s) are still assigned. Reassign or cancel them first.");

        var relationships = await db.Set<CoachMemberRelationship>().CountAsync(x => x.CoachId == userId && x.Status == RelationshipStatus.Active, ct);
        if (relationships > 0) reasons.Add($"{relationships} active coaching relationship(s). End or transfer them first.");
        return reasons;
    }

    private async Task EnsureNotLastActiveSystemAdministratorAsync(Guid userId, CancellationToken ct)
    {
        var otherActiveAdmins = await db.Set<UserAccount>()
            .CountAsync(
                u => u.UserId != userId
                     && u.Status == UserStatus.Active
                     && u.Role!.RoleName == UserRole.SystemAdministrator,
                ct);

        if (otherActiveAdmins == 0)
        {
            throw new ConflictException(
                "last_active_system_administrator",
                "Last active system administrator.");
        }
    }

    private static UserRole ParseRole(string role)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<UserRole>(role, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_role", "Invalid role.");

    private static UserStatus ParseStatus(string status)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<UserStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", "Invalid status.");

    private async Task<IReadOnlyList<UserAdminResponse>> WithSportsAsync(IReadOnlyList<UserAdminResponse> rows, CancellationToken ct)
    {
        var coachIds = rows.Where(r => r.Role == nameof(UserRole.Coach)).Select(r => r.UserId).ToList();
        var map = await specialties.GetForUsersAsync(coachIds, ct);
        var pendingIds = rows.Where(r => r.ActivationPending && r.Role != nameof(UserRole.Member))
            .Select(r => r.UserId.ToString()).ToArray();
        var invited = await db.Set<SportHub.Audit.Domain.Entities.AuditLog>().AsNoTracking()
            .Where(a => a.Action == AccountAuditActions.CreateStaffAccount && a.TargetEntity == nameof(UserAccount)
                && pendingIds.Contains(a.TargetId)).Select(a => a.TargetId).Distinct().ToListAsync(ct);
        var emails = rows.Where(r => invited.Contains(r.UserId.ToString())).Select(r => r.Email).ToArray();
        var links = await db.Set<EmailOtp>().AsNoTracking()
            .Where(o => emails.Contains(o.Email) && o.Purpose == EmailOtpPurpose.ResetPassword)
            .ToDictionaryAsync(o => o.Email, ct);
        return rows.Select(r => r with
        {
            SportIds = map.GetValueOrDefault(r.UserId) ?? r.SportIds,
            ActivationExpiresAtUtc = invited.Contains(r.UserId.ToString())
                ? r.CreatedAt + StaffInvitationExpiryService.InvitationLifetime : null,
            ActivationResendAvailableAtUtc = links.TryGetValue(r.Email, out var link)
                ? link.CreatedAt + AuthService.OtpResendCooldown : null
        }).ToList();
    }

    private static System.Linq.Expressions.Expression<Func<UserAccount, UserAdminResponse>> Projection()
        => u => new UserAdminResponse(
            u.UserId,
            u.Email,
            u.Profile != null ? u.Profile.FullName : string.Empty,
            u.Profile != null ? u.Profile.Phone : null,
            u.Role!.RoleName.ToString(),
            u.Status.ToString(),
            u.CreatedAt,

            // BR-60: FE dùng cờ này để biết tài khoản Google-only chưa đặt mật khẩu.
            u.Credential != null && u.Credential.PasswordHash != null,
            u.ExternalLogins.Any(),

            // Điền sau truy vấn (SportIds nằm ở bảng chuyên môn).
            new List<int>())
        {
            AvatarUrl = u.Profile != null ? u.Profile.AvatarUrl : null,
            ActivationPending = (u.Credential == null || u.Credential.PasswordHash == null)
                                && !u.ExternalLogins.Any()
        };
}
