using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

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
    IPasswordHasher passwordHasher,
    CoachSpecialtyService specialties,
    IAuditWriter audit,
    IClock clock) : IUserAdminService
{
    public async Task<PagedResult<UserAdminResponse>> SearchAsync(
        string? keyword,
        string? role,
        string? status,
        int page,
        int pageSize,
        CancellationToken ct = default)
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
            var parsedStatus = ParseStatus(status);
            query = query.Where(u => u.Status == parsedStatus);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderBy(u => u.Email)
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
                  ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

        return (await WithSportsAsync([row], ct))[0];
    }

    public async Task<UserAdminResponse> CreateStaffAsync(
        CreateStaffAccountRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var targetRole = ParseRole(request.Role);

        // ExternalCoach tự đăng ký + Manager duyệt (BR-105); không tạo/gán từ màn hình quản trị.
        if (targetRole == UserRole.ExternalCoach)
        {
            throw new BadRequestException(
                "external_coach_managed_separately",
                "Coach ngoài tự đăng ký và do Manager duyệt, không tạo hoặc gán vai trò từ màn hình quản trị.");
        }

        // BR-1: Hội viên TỰ đăng ký. BR-2 liệt kê đúng 4 vai trò mà SysAdmin được tạo và
        // Member không nằm trong đó — nên endpoint này từ chối tạo Member thay vì lặng lẽ cho qua.
        if (targetRole == UserRole.Member)
        {
            throw new BadRequestException(
                "member_must_self_register",
                "Tài khoản Hội viên phải tự đăng ký (BR-1), không tạo từ màn hình quản trị.");
        }

        var email = request.Email.Trim();
        SportHub.Identity.Application.Services.PasswordPolicyGuard.Enforce(request.Password, email);
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();

        if (await db.Set<UserAccount>().AnyAsync(u => u.Email == email, ct))
        {
            throw new ConflictException("email_already_exists", "Email đã được sử dụng.");
        }

        if (phone is not null && await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
        {
            throw new ConflictException("phone_already_exists", "Số điện thoại đã được sử dụng.");
        }

        // BR-96 — tài khoản role Coach phải có chuyên môn (ít nhất một môn đang hoạt động), chọn ngay lúc tạo. Role khác không
        // được nhận môn chuyên môn để tránh dữ liệu mơ hồ.
        IReadOnlyList<int>? coachSportIds = null;

        if (targetRole == UserRole.Coach)
        {
            coachSportIds = await specialties.ValidateAsync(request.SportIds, ct);
        }
        else if (request.SportIds is { Count: > 0 })
        {
            throw new BadRequestException(
                "sport_ids_not_applicable", "Chỉ tài khoản role Coach mới nhận môn chuyên môn.");
        }

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == targetRole, ct);

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow,
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(request.Password) },
            Profile = new UserProfile { FullName = request.FullName.Trim(), Phone = phone },
            CoachProfile = coachSportIds is not null ? new CoachProfile() : null
        };

        db.Set<UserAccount>().Add(user);

        if (coachSportIds is not null)
        {
            await specialties.ReplaceAsync(user.UserId, coachSportIds, ct);
        }

        audit.Write(new AuditEntry(
            actorUserId,
            "CREATE_STAFF_ACCOUNT",
            nameof(UserAccount),
            user.UserId.ToString(),
            OldValue: null,
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                email,
                role = targetRole.ToString(),
                sportIds = coachSportIds
            })));

        // Một SaveChanges cho cả tài khoản lẫn audit — EF gói trong một transaction, nên
        // không có trạng thái "đã tạo tài khoản nhưng thiếu log" (BR-7).
        await db.SaveChangesAsync(ct);

        return await GetAsync(user.UserId, ct);
    }

    public async Task<UserAdminResponse> ChangeRoleAsync(
        Guid userId,
        ChangeUserRoleRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var targetRole = ParseRole(request.Role);

        var user = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .Include(u => u.CoachProfile)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

        var currentRole = user.Role!.RoleName;

        if (targetRole == UserRole.ExternalCoach || currentRole == UserRole.ExternalCoach)
        {
            throw new BadRequestException(
                "external_coach_managed_separately",
                "Vai trò Coach ngoài do quy trình đăng ký/duyệt quản lý, không đổi từ màn hình quản trị.");
        }

        if (currentRole == targetRole)
        {
            return await GetAsync(userId, ct);
        }

        // Cùng lý do với BR-6 "không khoá SysAdmin hoạt động cuối cùng": hạ vai trò của
        // SysAdmin Active cuối cùng cũng khiến hệ thống không còn ai tạo được tài khoản
        // hay mở khoá (BR-2/BR-6) — tự khoá chính mình ra ngoài.
        if (currentRole == UserRole.SystemAdministrator)
        {
            await EnsureNotLastActiveSystemAdministratorAsync(userId, ct);
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
                "sport_ids_not_applicable", "Chỉ áp dụng môn chuyên môn khi đổi vai trò sang Coach.");
        }

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == targetRole, ct);

        user.RoleId = role.RoleId;

        // BR-103/104: đổi vai trò vô hiệu mọi token đang lưu hành (claim sst + role không còn khớp DB).
        user.SecurityStamp = Guid.NewGuid();

        audit.Write(new AuditEntry(
            actorUserId,
            "CHANGE_USER_ROLE",
            nameof(UserAccount),
            userId.ToString(),
            OldValue: $"{{\"role\":\"{currentRole}\"}}",
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { role = targetRole.ToString(), sportIds = newSportIds }),
            Reason: request.Reason.Trim()));

        await db.SaveChangesAsync(ct);

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
                "Không được tự khóa tài khoản của chính mình (BR-6).");
        }

        var user = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

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

        audit.Write(new AuditEntry(
            actorUserId,
            target == UserStatus.Active ? "UNLOCK_USER_ACCOUNT" : "LOCK_USER_ACCOUNT",
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
                "Đây là System Administrator đang hoạt động cuối cùng — không thể khóa hoặc đổi vai trò (BR-6).");
        }
    }

    private static UserRole ParseRole(string role)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<UserRole>(role, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_role", $"Vai trò không hợp lệ: '{role}'.");

    private static UserStatus ParseStatus(string status)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<UserStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", $"Trạng thái không hợp lệ: '{status}'.");

    private async Task<IReadOnlyList<UserAdminResponse>> WithSportsAsync(IReadOnlyList<UserAdminResponse> rows, CancellationToken ct)
    {
        var coachIds = rows.Where(r => r.Role == nameof(UserRole.Coach)).Select(r => r.UserId).ToList();
        if (coachIds.Count == 0)
        {
            return rows;
        }

        var map = await specialties.GetForUsersAsync(coachIds, ct);

        return rows.Select(r => map.TryGetValue(r.UserId, out var ids) ? r with { SportIds = ids } : r).ToList();
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
            new List<int>());
}
