using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;
using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Infrastructure.Authentication;

namespace SportHub.Identity.Application.Services;

public sealed record MyAccountResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Role,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    DateTime CreatedAt,
    bool HasPassword,
    bool HasGoogleLink,
    IReadOnlyList<int> SportIds);

/// <summary>JWT mới cho phiên vừa đổi mật khẩu; các token cũ đã bị vô hiệu bằng security stamp.</summary>
public sealed record PasswordChangedResponse(string AccessToken);

public sealed class UpdateMyProfileRequest
{
    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }
}


/// <summary>
/// Hồ sơ và mật khẩu của chính người dùng — BR-60 (đặt mật khẩu phải làm từ bên trong phiên
/// đã xác thực), BR-62 (số điện thoại duy nhất).
///
/// Mọi hàm nhận userId từ JWT ở controller, không nhận từ body.
/// </summary>
public sealed class AccountService(
    ISportHubDbContext db,
    IPasswordHasher passwordHasher,
    IOptions<JwtOptions> jwtOptions) : IAccountService
{
    public async Task<MyAccountResponse> GetMeAsync(Guid userId, CancellationToken ct = default)
        => await db.Set<UserAccount>()
               .AsNoTracking()
               .Where(u => u.UserId == userId)
               .Select(u => new MyAccountResponse(
                   u.UserId,
                   u.Email,
                   u.Profile != null ? u.Profile.FullName : string.Empty,
                   u.Profile != null ? u.Profile.Phone : null,
                   u.Role!.RoleName.ToString(),
                   u.Status.ToString(),
                   u.CreatedAt,
                   u.Credential != null && u.Credential.PasswordHash != null,
                   u.ExternalLogins.Any(),
                   db.Set<UserSportSpecialty>().Where(s => s.UserId == u.UserId).Select(s => s.SportId).ToList()))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

    public async Task<MyAccountResponse> UpdateProfileAsync(
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
    /// BR-60/104 — đặt/đổi mật khẩu chỉ làm được TỪ BÊN TRONG một phiên đã xác thực.
    /// Tài khoản Google-only đặt lần đầu thì không cần mật khẩu cũ; tài khoản đã có mật khẩu thì
    /// bắt buộc nhập đúng mật khẩu hiện tại và mật khẩu mới phải khác mật khẩu cũ.
    /// Thành công: đổi security stamp (mọi token cũ mất hiệu lực) và trả JWT mới cho chính phiên này.
    /// </summary>
    public async Task<PasswordChangedResponse> ChangePasswordAsync(
        Guid userId,
        ChangePasswordRequest request,
        CancellationToken ct = default)
    {
        PasswordPolicyGuard.EnforceConfirmation(request.NewPassword, request.ConfirmNewPassword);

        var user = await db.Set<UserAccount>()
                       .Include(u => u.Credential)
                       .Include(u => u.Role)
                       .SingleOrDefaultAsync(u => u.UserId == userId, ct)
                   ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

        PasswordPolicyGuard.Enforce(request.NewPassword, user.Email);

        var credential = user.Credential;

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
                throw new BadRequestException("current_password_incorrect", "Mật khẩu hiện tại không đúng.");
            }

            if (passwordHasher.Verify(request.NewPassword, credential.PasswordHash))
            {
                throw new BadRequestException(
                    "new_password_same_as_current", "Mật khẩu mới phải khác mật khẩu hiện tại.");
            }
        }
        else
        {
            // Tốn đúng một phép hash kể cả ở nhánh này: không để thời gian phản hồi tiết lộ
            // tài khoản đã có mật khẩu hay chưa.
            passwordHasher.VerifyDummy(request.CurrentPassword ?? string.Empty);
        }

        credential.PasswordHash = passwordHasher.Hash(request.NewPassword);
        user.SecurityStamp = Guid.NewGuid();

        await db.SaveChangesAsync(ct);

        return new PasswordChangedResponse(
            JwtService.GenerateAccessToken(
                user.UserId, user.Role!.RoleName.ToString(), jwtOptions.Value, user.SecurityStamp));
    }
}
