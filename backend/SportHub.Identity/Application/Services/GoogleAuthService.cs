using System.Text;
using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Exceptions;
using SportHub.Identity.Infrastructure.Security;

namespace SportHub.Identity.Application.Services;

public sealed record GoogleIdentity(string Subject, string Email, string? Name);

public sealed class GoogleTokenVerifier(IConfiguration configuration) : IGoogleTokenVerifier
{
    public async Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct = default)
    {
        var clientId = configuration["Google:ClientId"];

        if (string.IsNullOrWhiteSpace(clientId))
        {
            throw new AppException(
                503,
                "google_login_not_configured",
                "Đăng nhập Google chưa được cấu hình trên máy chủ (thiếu Google:ClientId).");
        }

        GoogleJsonWebSignature.Payload payload;

        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(
                idToken,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] });
        }
        catch (InvalidJwtException ex)
        {
            throw new AppException(401, "invalid_google_token", $"Google ID token không hợp lệ: {ex.Message}");
        }

        if (!payload.EmailVerified)
        {
            throw new AppException(
                401, "google_email_not_verified", "Email Google chưa được xác minh.");
        }

        return new GoogleIdentity(payload.Subject, payload.Email, payload.Name);
    }
}

/// <summary>
/// Đăng nhập Google. Quy tắc nghiệp vụ: docs/SportManagement_BusinessRules_v2.0_updated.docx, mục P (thay BR-59, BR-60 cũ).
/// - Danh tính Google đã liên kết: đăng nhập thẳng.
/// - Email Google (đã được Google xác minh) trùng một tài khoản có sẵn: tự liên kết tài khoản đó với Google rồi đăng nhập.
/// - Email chưa có tài khoản: tạo ngay tài khoản Member với mật khẩu trống (password_hash = NULL).
///   Người dùng tự đặt mật khẩu sau, trong Cài đặt tài khoản (có xác nhận OTP qua email) hoặc qua "Quên mật khẩu".
/// </summary>
public sealed class GoogleAuthService(
    ISportHubDbContext db,
    IGoogleTokenVerifier verifier,
    IOptions<JwtOptions> jwtOptions,
    IClock clock,
    IUserSummaryFactory summaries) : IGoogleAuthService
{
    public async Task<AuthResponse> LoginAsync(string idToken, CancellationToken ct = default)
    {
        var identity = await verifier.VerifyAsync(idToken, ct);
        var email = identity.Email.Trim();

        var existingLink = await FindByGoogleSubjectAsync(identity.Subject, ct);

        if (existingLink is not null)
        {
            return await SignInAsync(existingLink.UserAccount!, isNewAccount: false, ct);
        }

        var owner = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .Include(u => u.Profile)
            .Include(u => u.CoachProfile)
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        if (owner is not null)
        {
            EnsureActive(owner);

            if (await db.Set<UserExternalLogin>().AnyAsync(
                    l => l.UserId == owner.UserId && l.Provider == ExternalAuthProvider.Google, ct))
            {
                // Tài khoản này đã gắn với một danh tính Google khác: không ghi đè ngầm.
                throw new ConflictException(
                    "google_identity_mismatch",
                    "Tài khoản với email này đã liên kết với một tài khoản Google khác.");
            }

            db.Set<UserExternalLogin>().Add(NewLink(owner.UserId, identity.Subject));

            await SaveOrConflictAsync(ct);

            return await SignInAsync(owner, isNewAccount: false, ct);
        }

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == UserRole.Member, ct);
        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow,
            // Chưa có mật khẩu nội bộ: dòng credential tồn tại nhưng password_hash = NULL.
            Credential = new UserCredential { PasswordHash = null },
            Profile = new UserProfile { FullName = DisplayName(identity), Phone = null }
        };

        user.ExternalLogins.Add(NewLink(user.UserId, identity.Subject));
        db.Set<UserAccount>().Add(user);

        await SaveOrConflictAsync(ct);

        user.Role = role;

        return await SignInAsync(user, isNewAccount: true, ct);
    }

    private Task<UserExternalLogin?> FindByGoogleSubjectAsync(string subject, CancellationToken ct)
        => db.Set<UserExternalLogin>()
            .Include(l => l.UserAccount).ThenInclude(u => u!.Role)
            .Include(l => l.UserAccount).ThenInclude(u => u!.Profile)
            .Include(l => l.UserAccount).ThenInclude(u => u!.CoachProfile)
            .SingleOrDefaultAsync(l => l.Provider == ExternalAuthProvider.Google && l.ProviderUserId == subject, ct);

    private UserExternalLogin NewLink(Guid userId, string subject) => new()
    {
        ExternalLoginId = Guid.NewGuid(),
        UserId = userId,
        Provider = ExternalAuthProvider.Google,
        ProviderUserId = subject,
        RefreshToken = null,
        CreatedAt = clock.UtcNow
    };

    private static string DisplayName(GoogleIdentity identity)
    {
        if (!string.IsNullOrWhiteSpace(identity.Name))
        {
            return identity.Name.Trim();
        }

        var at = identity.Email.IndexOf('@');
        return at > 0 ? identity.Email[..at] : identity.Email;
    }

    private static void EnsureActive(UserAccount user)
    {
        if (user.Status != UserStatus.Active)
        {
            throw new AccountBlockedException(user.Status);
        }
    }

    private async Task<AuthResponse> SignInAsync(UserAccount user, bool isNewAccount, CancellationToken ct)
    {
        EnsureActive(user);
        return await BuildAuthResponseAsync(user, isNewAccount, ct);
    }

    /// <summary>
    /// Lưu thay đổi. Vi phạm unique index nghĩa là một request song song vừa tạo cùng email/danh tính Google:
    /// trả 409 để client thử lại (lần sau sẽ vào nhánh đã liên kết). Request kết thúc nên không cần dọn tracker.
    /// </summary>
    private async Task SaveOrConflictAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException(
                "google_login_conflict",
                "Đăng nhập Google đang được xử lý ở một yêu cầu khác. Vui lòng thử lại.");
        }
    }

    public async Task LinkAsync(Guid userId, string idToken, CancellationToken ct = default)
    {
        var identity = await verifier.VerifyAsync(idToken, ct);

        var takenByOther = await db.Set<UserExternalLogin>().AnyAsync(
            l => l.Provider == ExternalAuthProvider.Google
                 && l.ProviderUserId == identity.Subject
                 && l.UserId != userId,
            ct);

        if (takenByOther)
        {
            throw new ConflictException(
                "google_identity_already_linked", "Tài khoản Google này đã được liên kết với người dùng khác.");
        }

        var alreadyLinked = await db.Set<UserExternalLogin>().AnyAsync(
            l => l.UserId == userId && l.Provider == ExternalAuthProvider.Google, ct);

        if (alreadyLinked)
        {
            throw new ConflictException(
                "google_already_linked", "Tài khoản của bạn đã liên kết với một tài khoản Google.");
        }

        db.Set<UserExternalLogin>().Add(new UserExternalLogin
        {
            ExternalLoginId = Guid.NewGuid(),
            UserId = userId,
            Provider = ExternalAuthProvider.Google,
            ProviderUserId = identity.Subject,
            RefreshToken = null,
            CreatedAt = clock.UtcNow
        });

        await db.SaveChangesAsync(ct);
    }

    public async Task UnlinkAsync(Guid userId, CancellationToken ct = default)
    {
        var link = await db.Set<UserExternalLogin>()
            .SingleOrDefaultAsync(l => l.UserId == userId && l.Provider == ExternalAuthProvider.Google, ct)
            ?? throw new NotFoundException("google_link_not_found", "Tài khoản chưa liên kết Google.");

        var hasPassword = await db.Set<UserCredential>()
            .AnyAsync(c => c.UserId == userId && c.PasswordHash != null, ct);

        if (!hasPassword)
        {
            throw new ConflictException(
                "password_required_before_unlink",
                "Hãy đặt mật khẩu trước khi gỡ liên kết Google, nếu không bạn sẽ không đăng nhập được nữa.");
        }

        db.Set<UserExternalLogin>().Remove(link);
        await db.SaveChangesAsync(ct);
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(UserAccount user, bool isNewAccount, CancellationToken ct)
        => new()
        {
            AccessToken = JwtService.GenerateAccessToken(
                user.UserId, user.Role!.RoleName.ToString(), jwtOptions.Value, user.SecurityStamp),
            User = await summaries.BuildAsync(user, ct),
            IsNewAccount = isNewAccount
        };
}
