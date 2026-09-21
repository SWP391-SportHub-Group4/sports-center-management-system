using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Application.Services;

public sealed record MyAccountDto(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    string Role,
    string Status,
    DateTime CreatedAt,
    bool HasPassword,
    bool HasGoogleLink);

public sealed class UpdateMyProfileRequest
{
    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }
}

public sealed class SetPasswordRequest
{
    /// <summary>
    /// Bắt buộc khi tài khoản ĐÃ có mật khẩu; bỏ trống với tài khoản Google-only đang đặt
    /// mật khẩu lần đầu (BR-60).
    /// </summary>
    [MaxPasswordBytes(72)]
    public string? CurrentPassword { get; set; }

    [Required, MinLength(8), MaxPasswordBytes(72)]
    public string NewPassword { get; set; } = string.Empty;
}

public interface IAccountService
{
    Task<MyAccountDto> GetMeAsync(Guid userId, CancellationToken ct = default);

    Task<MyAccountDto> UpdateProfileAsync(Guid userId, UpdateMyProfileRequest request, CancellationToken ct = default);

    Task SetPasswordAsync(Guid userId, SetPasswordRequest request, CancellationToken ct = default);
}

/// <summary>
/// Hồ sơ và mật khẩu của chính người dùng — BR-60 (đặt mật khẩu phải làm từ bên trong phiên
/// đã xác thực), BR-62 (số điện thoại duy nhất).
///
/// Mọi hàm nhận userId từ JWT ở controller, không nhận từ body.
/// </summary>
public sealed class AccountService(ISportHubDbContext db, IPasswordHasher passwordHasher) : IAccountService
{
    public async Task<MyAccountDto> GetMeAsync(Guid userId, CancellationToken ct = default)
        => await db.Set<UserAccount>()
               .AsNoTracking()
               .Where(u => u.UserId == userId)
               .Select(u => new MyAccountDto(
                   u.UserId,
                   u.Email,
                   u.Profile != null ? u.Profile.FullName : string.Empty,
                   u.Profile != null ? u.Profile.Phone : null,
                   u.Role!.RoleName.ToString(),
                   u.Status.ToString(),
                   u.CreatedAt,
                   u.Credential != null && u.Credential.PasswordHash != null,
                   u.ExternalLogins.Any()))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

    public async Task<MyAccountDto> UpdateProfileAsync(
        Guid userId,
        UpdateMyProfileRequest request,
        CancellationToken ct = default)
    {
        var profile = await db.Set<UserProfile>().SingleOrDefaultAsync(p => p.UserId == userId, ct);

        if (profile is null)
        {
            profile = new UserProfile { UserId = userId };
            db.Set<UserProfile>().Add(profile);
        }

        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();

        profile.FullName = request.FullName.Trim();
        profile.Phone = phone;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException
                  {
                      SqlState: PostgresErrorCodes.UniqueViolation,
                      ConstraintName: "ix_user_profiles_phone"
                  })
        {
            // BR-62 — partial unique index là nơi chặn thật; kiểm trước bằng SELECT vẫn hở khe
            // cho hai request đồng thời.
            throw new ConflictException("phone_already_exists", "Số điện thoại đã được tài khoản khác sử dụng.");
        }

        return await GetMeAsync(userId, ct);
    }

    /// <summary>
    /// BR-60 — đặt/đổi mật khẩu chỉ làm được TỪ BÊN TRONG một phiên đã xác thực.
    /// Tài khoản Google-only đặt lần đầu thì không cần mật khẩu cũ (vì chưa có);
    /// tài khoản đã có mật khẩu thì bắt buộc nhập đúng mật khẩu hiện tại.
    /// </summary>
    public async Task SetPasswordAsync(
        Guid userId,
        SetPasswordRequest request,
        CancellationToken ct = default)
    {
        var credential = await db.Set<UserCredential>().SingleOrDefaultAsync(c => c.UserId == userId, ct);

        if (credential is null)
        {
            credential = new UserCredential { UserId = userId };
            db.Set<UserCredential>().Add(credential);
        }

        if (credential.PasswordHash is not null)
        {
            if (string.IsNullOrEmpty(request.CurrentPassword))
            {
                throw new BadRequestException(
                    "current_password_required", "Phải nhập mật khẩu hiện tại để đổi mật khẩu.");
            }

            if (!passwordHasher.Verify(request.CurrentPassword, credential.PasswordHash))
            {
                throw new AppException(401, "invalid_credentials", "Mật khẩu hiện tại không đúng.");
            }
        }
        else
        {
            // Tốn đúng một phép BCrypt kể cả ở nhánh này, cùng lý do với AuthService.LoginAsync
            // (SSOT §5.6): không để thời gian phản hồi tiết lộ tài khoản đã có mật khẩu hay chưa.
            passwordHasher.VerifyDummy(request.CurrentPassword ?? string.Empty);
        }

        credential.PasswordHash = passwordHasher.Hash(request.NewPassword);

        // KHÔNG thu hồi các JWT đang lưu hành sau khi đổi mật khẩu: cơ chế đó (security stamp /
        // logout-all) là scope riêng theo SSOT §5.6 và chưa được triển khai. Ghi rõ ở đây để
        // không ai đọc code này rồi tưởng đổi mật khẩu là đã đăng xuất mọi thiết bị.
        await db.SaveChangesAsync(ct);
    }
}
