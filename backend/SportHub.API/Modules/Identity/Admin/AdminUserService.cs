using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.Audit.Domain.Entities;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.API.Modules.Identity.Admin;

public sealed class AdminUserService
{
    private static readonly UserRole[] CreatableInternalRoles =
    [
        UserRole.SystemAdministrator,
        UserRole.CenterManager,
        UserRole.Coach,
        UserRole.Receptionist
    ];

    private readonly SportHubDbContext _db;
    private readonly IPasswordHasher<UserAccount> _passwordHasher;

    public AdminUserService(
        SportHubDbContext db,
        IPasswordHasher<UserAccount> passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    public async Task<AdminUserListResponse> GetUsersAsync(
        int page,
        int pageSize,
        string? search,
        string? role,
        string? status,
        CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.UserAccounts
            .AsNoTracking()
            .Include(x => x.Role)
            .Include(x => x.Profile)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x =>
                EF.Functions.ILike(x.Email, $"%{term}%") ||
                (x.Profile != null && EF.Functions.ILike(x.Profile.FullName, $"%{term}%")) ||
                (x.Profile != null && x.Profile.Phone != null && EF.Functions.ILike(x.Profile.Phone, $"%{term}%")));
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            var parsedRole = ParseRole(role, allowMember: true);
            query = query.Where(x => x.Role != null && x.Role.RoleName == parsedRole);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsedStatus = ParseStatus(status);
            query = query.Where(x => x.Status == parsedStatus);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var users = await query
            .OrderByDescending(x => x.CreatedAt)
            .ThenBy(x => x.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new AdminUserListItemResponse(
                x.UserId,
                x.Email,
                x.Profile != null ? x.Profile.FullName : string.Empty,
                x.Profile != null ? x.Profile.Phone : null,
                x.Role != null ? ToApiRole(x.Role.RoleName) : string.Empty,
                ToApiStatus(x.Status),
                x.CreatedAt))
            .ToListAsync(cancellationToken);

        return new AdminUserListResponse(page, pageSize, totalCount, users);
    }

    public async Task<AdminUserDetailResponse> GetUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.UserAccounts
            .AsNoTracking()
            .Include(x => x.Role)
            .Include(x => x.Profile)
            .FirstOrDefaultAsync(x => x.UserId == userId, cancellationToken);

        if (user is null)
            throw new AdminOperationException(StatusCodes.Status404NotFound, "user_not_found", "User account was not found.");

        return MapDetail(user);
    }

    public async Task<IReadOnlyList<AdminRoleResponse>> GetRolesAsync(CancellationToken cancellationToken)
    {
        var roles = await _db.Roles
            .AsNoTracking()
            .OrderBy(x => x.RoleId)
            .ToListAsync(cancellationToken);

        return roles
            .Select(x => new AdminRoleResponse(x.RoleId, ToApiRole(x.RoleName)))
            .ToList();
    }

    public async Task<AdminUserDetailResponse> CreateInternalAccountAsync(
        CreateInternalAccountRequest request,
        Guid actorUserId,
        string ipAddress,
        CancellationToken cancellationToken)
    {
        var normalizedEmail = request.Email.Trim();
        var fullName = request.FullName.Trim();
        var phone = NormalizeNullable(request.Phone);
        var role = ParseRole(request.Role, allowMember: false);

        if (!CreatableInternalRoles.Contains(role))
            throw new AdminOperationException(StatusCodes.Status400BadRequest, "invalid_internal_role", "Admin may create only SYSTEM_ADMINISTRATOR, CENTER_MANAGER, COACH or RECEPTIONIST accounts.");

        if (await _db.UserAccounts.AnyAsync(x => x.Email == normalizedEmail, cancellationToken))
            throw new AdminOperationException(StatusCodes.Status409Conflict, "email_exists", "Email is already registered.");

        if (phone is not null && await _db.UserProfiles.AnyAsync(x => x.Phone == phone, cancellationToken))
            throw new AdminOperationException(StatusCodes.Status409Conflict, "phone_exists", "Phone number is already in use.");

        var roleEntity = await _db.Roles.FirstOrDefaultAsync(x => x.RoleName == role, cancellationToken);
        if (roleEntity is null)
            throw new AdminOperationException(StatusCodes.Status500InternalServerError, "role_seed_missing", "Required role seed data is missing.");

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var now = DateTime.UtcNow;
            var user = new UserAccount
            {
                UserId = Guid.NewGuid(),
                Email = normalizedEmail,
                RoleId = roleEntity.RoleId,
                Status = UserStatus.Active,
                CreatedAt = now
            };

            var credential = new UserCredential
            {
                UserId = user.UserId,
                PasswordHash = _passwordHasher.HashPassword(user, request.Password)
            };

            var profile = new UserProfile
            {
                UserId = user.UserId,
                FullName = fullName,
                Phone = phone
            };

            _db.UserAccounts.Add(user);
            _db.UserCredentials.Add(credential);
            _db.UserProfiles.Add(profile);

            _db.AuditLogs.Add(new AuditLog
            {
                AuditId = Guid.NewGuid(),
                UserId = actorUserId,
                Action = "CREATE_INTERNAL_ACCOUNT",
                TargetEntity = nameof(UserAccount),
                TargetId = user.UserId,
                OldValue = null,
                NewValue = JsonSerializer.Serialize(new
                {
                    user.Email,
                    Role = ToApiRole(role),
                    Status = ToApiStatus(UserStatus.Active),
                    Profile = new { profile.FullName, profile.Phone }
                }),
                IpAddress = ipAddress,
                Timestamp = now
            });

            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            user.Role = roleEntity;
            user.Profile = profile;
            return MapDetail(user);
        }
        catch (DbUpdateException ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            throw new AdminOperationException(StatusCodes.Status409Conflict, "identity_constraint_conflict", "Account could not be created because a unique identity constraint was violated.");
        }
    }

    public async Task<AdminUserDetailResponse> UpdateRoleAsync(
        Guid targetUserId,
        UpdateUserRoleRequest request,
        Guid actorUserId,
        string ipAddress,
        CancellationToken cancellationToken)
    {
        var newRole = ParseRole(request.Role, allowMember: false);
        if (!CreatableInternalRoles.Contains(newRole))
            throw new AdminOperationException(StatusCodes.Status400BadRequest, "invalid_internal_role", "Internal account role must be SYSTEM_ADMINISTRATOR, CENTER_MANAGER, COACH or RECEPTIONIST.");

        var user = await _db.UserAccounts
            .Include(x => x.Role)
            .Include(x => x.Profile)
            .FirstOrDefaultAsync(x => x.UserId == targetUserId, cancellationToken);

        if (user is null)
            throw new AdminOperationException(StatusCodes.Status404NotFound, "user_not_found", "User account was not found.");

        var oldRole = user.Role?.RoleName
            ?? throw new AdminOperationException(StatusCodes.Status500InternalServerError, "role_missing", "Target account has no valid role.");

        if (oldRole == UserRole.Member)
            throw new AdminOperationException(StatusCodes.Status409Conflict, "member_role_change_not_supported", "Member role changes are outside the committed Admin internal-account flow.");

        if (oldRole == newRole)
            return MapDetail(user);

        if (oldRole == UserRole.SystemAdministrator && newRole != UserRole.SystemAdministrator && user.Status == UserStatus.Active)
        {
            await EnsureAnotherActiveAdminExistsAsync(user.UserId, cancellationToken);
        }

        var roleEntity = await _db.Roles.FirstOrDefaultAsync(x => x.RoleName == newRole, cancellationToken);
        if (roleEntity is null)
            throw new AdminOperationException(StatusCodes.Status500InternalServerError, "role_seed_missing", "Required role seed data is missing.");

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

        user.RoleId = roleEntity.RoleId;
        user.Role = roleEntity;

        _db.AuditLogs.Add(new AuditLog
        {
            AuditId = Guid.NewGuid(),
            UserId = actorUserId,
            Action = "CHANGE_USER_ROLE",
            TargetEntity = nameof(UserAccount),
            TargetId = user.UserId,
            OldValue = JsonSerializer.Serialize(new { Role = ToApiRole(oldRole) }),
            NewValue = JsonSerializer.Serialize(new { Role = ToApiRole(newRole), request.Reason }),
            IpAddress = ipAddress,
            Timestamp = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return MapDetail(user);
    }

    public async Task<AdminUserDetailResponse> UpdateStatusAsync(
        Guid targetUserId,
        UpdateUserStatusRequest request,
        Guid actorUserId,
        string ipAddress,
        CancellationToken cancellationToken)
    {
        var newStatus = ParseStatus(request.Status);

        var user = await _db.UserAccounts
            .Include(x => x.Role)
            .Include(x => x.Profile)
            .FirstOrDefaultAsync(x => x.UserId == targetUserId, cancellationToken);

        if (user is null)
            throw new AdminOperationException(StatusCodes.Status404NotFound, "user_not_found", "User account was not found.");

        if (targetUserId == actorUserId && newStatus != UserStatus.Active)
            throw new AdminOperationException(StatusCodes.Status409Conflict, "self_lock_not_allowed", "System Administrator cannot ban or deactivate their own account.");

        var oldStatus = user.Status;
        if (oldStatus == newStatus)
            return MapDetail(user);

        if (user.Role?.RoleName == UserRole.SystemAdministrator && oldStatus == UserStatus.Active && newStatus != UserStatus.Active)
        {
            await EnsureAnotherActiveAdminExistsAsync(user.UserId, cancellationToken);
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

        user.Status = newStatus;

        _db.AuditLogs.Add(new AuditLog
        {
            AuditId = Guid.NewGuid(),
            UserId = actorUserId,
            Action = "CHANGE_USER_STATUS",
            TargetEntity = nameof(UserAccount),
            TargetId = user.UserId,
            OldValue = JsonSerializer.Serialize(new { Status = ToApiStatus(oldStatus) }),
            NewValue = JsonSerializer.Serialize(new { Status = ToApiStatus(newStatus), request.Reason }),
            IpAddress = ipAddress,
            Timestamp = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return MapDetail(user);
    }

    private async Task EnsureAnotherActiveAdminExistsAsync(Guid excludedUserId, CancellationToken cancellationToken)
    {
        var anotherActiveAdminExists = await _db.UserAccounts
            .AnyAsync(x =>
                x.UserId != excludedUserId &&
                x.Status == UserStatus.Active &&
                x.Role != null &&
                x.Role.RoleName == UserRole.SystemAdministrator,
                cancellationToken);

        if (!anotherActiveAdminExists)
            throw new AdminOperationException(StatusCodes.Status409Conflict, "last_active_admin", "The last active System Administrator cannot be disabled or moved to another role.");
    }

    private static AdminUserDetailResponse MapDetail(UserAccount user)
        => new(
            user.UserId,
            user.Email,
            user.Profile?.FullName ?? string.Empty,
            user.Profile?.Phone,
            user.Role is null ? string.Empty : ToApiRole(user.Role.RoleName),
            ToApiStatus(user.Status),
            user.CreatedAt);

    private static UserRole ParseRole(string value, bool allowMember)
    {
        var normalized = NormalizeToken(value);
        var role = normalized switch
        {
            "SYSTEMADMINISTRATOR" => UserRole.SystemAdministrator,
            "CENTERMANAGER" => UserRole.CenterManager,
            "COACH" => UserRole.Coach,
            "MEMBER" when allowMember => UserRole.Member,
            "RECEPTIONIST" => UserRole.Receptionist,
            _ => throw new AdminOperationException(StatusCodes.Status400BadRequest, "invalid_role", "Invalid role value.")
        };

        return role;
    }

    private static UserStatus ParseStatus(string value)
    {
        var normalized = NormalizeToken(value);
        return normalized switch
        {
            "ACTIVE" => UserStatus.Active,
            "BANNED" => UserStatus.Banned,
            "DEACTIVATED" => UserStatus.Deactivated,
            _ => throw new AdminOperationException(StatusCodes.Status400BadRequest, "invalid_status", "Status must be ACTIVE, BANNED or DEACTIVATED.")
        };
    }

    private static string NormalizeToken(string value)
        => new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    private static string? NormalizeNullable(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string ToApiRole(UserRole role) => role switch
    {
        UserRole.SystemAdministrator => "SYSTEM_ADMINISTRATOR",
        UserRole.CenterManager => "CENTER_MANAGER",
        UserRole.Coach => "COACH",
        UserRole.Member => "MEMBER",
        UserRole.Receptionist => "RECEPTIONIST",
        _ => role.ToString().ToUpperInvariant()
    };

    private static string ToApiStatus(UserStatus status) => status switch
    {
        UserStatus.Active => "ACTIVE",
        UserStatus.Banned => "BANNED",
        UserStatus.Deactivated => "DEACTIVATED",
        _ => status.ToString().ToUpperInvariant()
    };
}
