using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Identity.Application.Services;

public sealed record GoogleIdentity(string Subject, string Email, string? Name);

public sealed class GoogleTokenVerifier(IConfiguration configuration) : IGoogleTokenVerifier
{
    public async Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct = default)
    {
        var clientId = configuration["Google:ClientId"];

        // Chưa cấu hình thì báo rõ là lỗi CẤU HÌNH, không phải token sai — nếu không, người
        // chạy demo sẽ đi tìm lỗi ở phía Google trong khi vấn đề nằm ở file .env.
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

        // Email chưa xác minh phía Google thì không dùng để định danh được: bất kỳ ai cũng
        // khai được một email chưa xác minh và sẽ dựng nên tài khoản mang email của người khác.
        if (!payload.EmailVerified)
        {
            throw new AppException(
                401, "google_email_not_verified", "Email Google chưa được xác minh.");
        }

        return new GoogleIdentity(payload.Subject, payload.Email, payload.Name);
    }
}

/// <summary>
/// Đăng nhập Google — BR-59 (chỉ liên kết bằng thao tác TƯỜNG MINH khi đã đăng nhập; không
/// bao giờ tự liên kết hay tự tạo tài khoản chỉ vì trùng email) và BR-60 (tài khoản
/// Google-only chưa có mật khẩu thì phải đăng nhập qua Google).
/// </summary>
public sealed class GoogleAuthService(
    ISportHubDbContext db,
    IGoogleTokenVerifier verifier,
    IOptions<JwtOptions> jwtOptions,
    IClock clock,
    IPasswordGenerator passwordGenerator) : IGoogleAuthService
{
    public async Task<AuthResponse> LoginAsync(string idToken, CancellationToken ct = default)
    {
        var identity = await verifier.VerifyAsync(idToken, ct);

        var existingLink = await db.Set<UserExternalLogin>()
            .Include(l => l.UserAccount).ThenInclude(u => u!.Role)
            .Include(l => l.UserAccount).ThenInclude(u => u!.Profile)
            .SingleOrDefaultAsync(
                l => l.Provider == ExternalAuthProvider.Google && l.ProviderUserId == identity.Subject, ct);

        if (existingLink is not null)
        {
            var linkedUser = existingLink.UserAccount!;

            if (linkedUser.Status != UserStatus.Active)
            {
                throw new AccountBlockedException(linkedUser.Status);
            }

            return BuildResponse(linkedUser, isNewAccount: false, suggestedPassword: null);
        }

        var emailOwner = await db.Set<UserAccount>().AnyAsync(u => u.Email == identity.Email, ct);

        // BR-59 — đây chính là chỗ chặn pre-hijacking: đã có tài khoản mang email đó nhưng
        // CHƯA liên kết Google thì từ chối, không tự nối hai bên lại với nhau.
        if (emailOwner)
        {
            throw new ConflictException(
                "google_account_not_linked",
                "Email này đã có tài khoản trong hệ thống nhưng chưa liên kết Google. "
                + "Hãy đăng nhập bằng mật khẩu rồi thực hiện liên kết tài khoản Google (BR-59).");
        }

        // Chưa có tài khoản nào mang email đó — đăng ký mới qua Google. Không mâu thuẫn BR-59:
        // BR-59 cấm tự liên kết/tự tạo khi TRÙNG email của tài khoản đã tồn tại.
        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == UserRole.Member, ct);
        var now = clock.UtcNow;

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = identity.Email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = now,

            // BR-60 — tài khoản tạo thuần qua Google KHÔNG có password_hash; đăng nhập
            // email/mật khẩu bị chặn cho tới khi người dùng chủ động đặt mật khẩu.
            Credential = new UserCredential { PasswordHash = null },
            Profile = new UserProfile { FullName = identity.Name ?? identity.Email, Phone = null }
        };

        user.ExternalLogins.Add(new UserExternalLogin
        {
            ExternalLoginId = Guid.NewGuid(),
            Provider = ExternalAuthProvider.Google,
            ProviderUserId = identity.Subject,

            // KHÔNG lưu refresh token: SSOT §7 còn để mở việc mã hoá field này at rest, nên
            // không lưu vẫn hơn là lưu thô. Ứng dụng chỉ cần xác minh id_token rồi tự cấp JWT.
            RefreshToken = null,
            CreatedAt = now
        });

        db.Set<UserAccount>().Add(user);
        await db.SaveChangesAsync(ct);

        user.Role = role;

        // Chỉ GỢI Ý — không gán vào Credential ở trên, PasswordHash vẫn null (BR-60) cho tới
        // khi người dùng tự gọi POST /api/users/me/password.
        var suggestedPassword = passwordGenerator.GenerateStrong();

        return BuildResponse(user, isNewAccount: true, suggestedPassword);
    }

    /// <summary>
    /// BR-59 — liên kết TƯỜNG MINH, chỉ thực hiện được từ bên trong phiên đã đăng nhập đúng
    /// tài khoản đó (userId lấy từ JWT, không nhận từ body).
    /// </summary>
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

        // Gỡ liên kết khi chưa có mật khẩu sẽ khoá người dùng ra khỏi chính tài khoản của họ:
        // không còn đường đăng nhập nào (BR-60).
        if (!hasPassword)
        {
            throw new ConflictException(
                "password_required_before_unlink",
                "Hãy đặt mật khẩu trước khi gỡ liên kết Google, nếu không bạn sẽ không đăng nhập được nữa (BR-60).");
        }

        db.Set<UserExternalLogin>().Remove(link);
        await db.SaveChangesAsync(ct);
    }

    private AuthResponse BuildResponse(UserAccount user, bool isNewAccount, string? suggestedPassword)
        => new()
        {
            AccessToken = JwtService.GenerateAccessToken(
                user.UserId, user.Role!.RoleName.ToString(), jwtOptions.Value),
            User = new UserSummaryResponse
            {
                UserId = user.UserId,
                Email = user.Email,
                FullName = user.Profile?.FullName ?? string.Empty,
                Role = user.Role.RoleName.ToString()
            },
            IsNewAccount = isNewAccount,
            SuggestedPassword = suggestedPassword
        };
}
