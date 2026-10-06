using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Application.Services;

public sealed record CoachResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    string? Bio,
    IReadOnlyList<int> SportIds,
    DateTime CreatedAt);

/// <summary>
/// Manager quản lý Coach nội bộ: tạo tài khoản Coach kèm chuyên môn theo môn và đổi chuyên môn (BR-96). Chỉ Coach nội bộ
/// (có quy trình đăng ký/duyệt riêng) và không tạo được role nào khác Coach.
/// </summary>
public sealed class CoachAdminService(
    ISportHubDbContext db,
    IPasswordHasher passwordHasher,
    CoachSpecialtyService specialties,
    IAuditWriter audit,
    IClock clock)
{
    public async Task<PagedResult<CoachResponse>> SearchAsync(
        string? keyword, int? sportId, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var query = db.Set<UserAccount>().AsNoTracking().Where(u => u.Role!.RoleName == UserRole.Coach);

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(u => u.Email.ToLower().Contains(term)
                                     || (u.Profile != null && u.Profile.FullName.ToLower().Contains(term)));
        }

        if (sportId is int sid)
        {
            query = query.Where(u => db.Set<UserSportSpecialty>().Any(s => s.UserId == u.UserId && s.SportId == sid));
        }

        var total = await query.CountAsync(ct);

        var rows = await query
            .OrderBy(u => u.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new CoachResponse(
                u.UserId,
                u.Email,
                u.Profile != null ? u.Profile.FullName : string.Empty,
                u.Profile != null ? u.Profile.Phone : null,
                u.Status.ToString(),
                u.CoachProfile != null ? u.CoachProfile.Bio : null,
                new List<int>(),
                u.CreatedAt))
            .ToListAsync(ct);

        var map = await specialties.GetForUsersAsync(rows.Select(r => r.UserId).ToList(), ct);

        return new PagedResult<CoachResponse>
        {
            Items = rows.Select(r => map.TryGetValue(r.UserId, out var ids) ? r with { SportIds = ids } : r).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<CoachResponse> GetAsync(Guid userId, CancellationToken ct = default)
    {
        var row = await db.Set<UserAccount>().AsNoTracking()
                      .Where(u => u.UserId == userId && u.Role!.RoleName == UserRole.Coach)
                      .Select(u => new CoachResponse(
                          u.UserId,
                          u.Email,
                          u.Profile != null ? u.Profile.FullName : string.Empty,
                          u.Profile != null ? u.Profile.Phone : null,
                          u.Status.ToString(),
                          u.CoachProfile != null ? u.CoachProfile.Bio : null,
                          new List<int>(),
                          u.CreatedAt))
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("coach_not_found", "Không tìm thấy Coach.");

        var map = await specialties.GetForUsersAsync([userId], ct);
        return map.TryGetValue(userId, out var ids) ? row with { SportIds = ids } : row;
    }

    public async Task<CoachResponse> CreateAsync(CreateCoachRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var email = request.Email.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();

        PasswordPolicyGuard.Enforce(request.Password, email);

        if (await db.Set<UserAccount>().AnyAsync(u => u.Email == email, ct))
        {
            throw new ConflictException("email_already_exists", "Email đã được sử dụng.");
        }

        if (phone is not null && await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
        {
            throw new ConflictException("phone_already_exists", "Số điện thoại đã được sử dụng.");
        }

        var sportIds = await specialties.ValidateAsync(request.SportIds, ct);
        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == UserRole.Coach, ct);

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow,
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(request.Password) },
            Profile = new UserProfile { FullName = request.FullName.Trim(), Phone = phone },
            CoachProfile = new CoachProfile { Bio = Clean(request.Bio) }
        };

        db.Set<UserAccount>().Add(user);
        await specialties.ReplaceAsync(user.UserId, sportIds, ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_COACH", nameof(UserAccount), user.UserId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { email, sportIds })));

        await db.SaveChangesAsync(ct);

        return await GetAsync(user.UserId, ct);
    }

    public async Task<CoachResponse> UpdateAsync(Guid userId, UpdateCoachRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var user = await db.Set<UserAccount>()
                       .Include(u => u.CoachProfile)
                       .Include(u => u.Profile)
                       .SingleOrDefaultAsync(u => u.UserId == userId && u.Role!.RoleName == UserRole.Coach, ct)
                   ?? throw new NotFoundException("coach_not_found", "Không tìm thấy Coach.");

        var sportIds = await specialties.ValidateAsync(request.SportIds, ct);
        var phone = request.Phone is null ? user.Profile?.Phone : Clean(request.Phone);
        if (phone is not null && await db.Set<UserProfile>().AnyAsync(x => x.Phone == phone && x.UserId != userId, ct))
            throw new ConflictException("phone_already_exists", "Số điện thoại đã được sử dụng.");
        if (request.FullName is not null && !new FullNameAttribute().IsValid(request.FullName))
            throw new BadRequestException("invalid_full_name", "Họ tên cần 2–100 ký tự và đúng định dạng.");
        var oldProfile = new { fullName = user.Profile?.FullName, phone = user.Profile?.Phone };
        var before = await specialties.ReplaceAsync(userId, sportIds, ct);
        user.Profile ??= new UserProfile { UserId = userId };
        if (request.FullName is not null) user.Profile.FullName = request.FullName.Trim();
        user.Profile.Phone = phone;

        user.CoachProfile ??= new CoachProfile { UserId = userId };

        if (request.Bio is not null)
        {
            user.CoachProfile.Bio = Clean(request.Bio);
        }

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_COACH_SPECIALTIES", nameof(UserAccount), userId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { sportIds = before, profile = oldProfile }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { sportIds, fullName = user.Profile.FullName, phone })));

        // Bỏ môn khỏi chuyên môn không tự hủy lịch/lớp đã phân công: Manager xử lý riêng (chặn phân công mới ở P1.05b).
        await db.SaveChangesAsync(ct);

        return await GetAsync(userId, ct);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
