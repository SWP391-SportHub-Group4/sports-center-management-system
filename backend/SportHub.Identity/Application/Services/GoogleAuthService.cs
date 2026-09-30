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
/// Đăng nhập Google — BR-59 (chỉ liên kết bằng thao tác TƯỜNG MINH khi đã đăng nhập; không
/// bao giờ tự liên kết hay tự tạo tài khoản chỉ vì trùng email) và BR-60 (mật khẩu do
/// người dùng tự nhập khi hoàn tất onboarding Google).
/// </summary>
public sealed class GoogleAuthService(
    ISportHubDbContext db,
    IGoogleTokenVerifier verifier,
    IOptions<JwtOptions> jwtOptions,
    IClock clock,
    IPasswordHasher passwordHasher,
    IUserSummaryFactory summaries) : IGoogleAuthService
{
    public async Task<GoogleLoginResult> LoginAsync(string idToken, CancellationToken ct = default)
    {
        var identity = await verifier.VerifyAsync(idToken, ct);

        var existingLink = await db.Set<UserExternalLogin>()
            .Include(l => l.UserAccount).ThenInclude(u => u!.Role)
            .Include(l => l.UserAccount).ThenInclude(u => u!.Profile)
            .Include(l => l.UserAccount).ThenInclude(u => u!.CoachProfile)
            .SingleOrDefaultAsync(
                l => l.Provider == ExternalAuthProvider.Google && l.ProviderUserId == identity.Subject, ct);

        if (existingLink is not null)
        {
            var linkedUser = existingLink.UserAccount!;

            if (linkedUser.Status != UserStatus.Active)
            {
                throw new AccountBlockedException(linkedUser.Status);
            }

            return new GoogleLoginResult
            {
                RequiresOnboarding = false,
                Auth = await BuildAuthResponseAsync(linkedUser, isNewAccount: false, ct)
            };
        }

        var emailOwner = await db.Set<UserAccount>().AnyAsync(u => u.Email == identity.Email, ct);

        if (emailOwner)
        {
            throw new ConflictException(
                "google_account_not_linked",
                "Email này đã có tài khoản trong hệ thống nhưng chưa liên kết Google. "
                + "Hãy đăng nhập bằng mật khẩu rồi thực hiện liên kết tài khoản Google (BR-59).");
        }

        var now = clock.UtcNow;

        await db.Set<GoogleOnboardingTicket>()
            .Where(t => t.ProviderUserId == identity.Subject && t.ConsumedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.ConsumedAt, now), ct);

        var rawToken = GoogleOnboardingTokenService.GenerateRawToken();
        var ticket = new GoogleOnboardingTicket
        {
            TicketId = Guid.NewGuid(),
            TokenHash = GoogleOnboardingTokenService.HashToken(rawToken),
            ProviderUserId = identity.Subject,
            Email = identity.Email,
            SuggestedFullName = identity.Name,
            CreatedAt = now,
            ExpiresAt = now + GoogleOnboardingTokenService.TicketLifetime
        };

        db.Set<GoogleOnboardingTicket>().Add(ticket);
        await db.SaveChangesAsync(ct);

        return new GoogleLoginResult
        {
            RequiresOnboarding = true,
            Onboarding = new GoogleOnboardingPendingResponse
            {
                OnboardingToken = rawToken,
                Email = identity.Email,
                FullName = identity.Name ?? identity.Email,
                ExpiresAt = ticket.ExpiresAt
            }
        };
    }

    public async Task<AuthResponse> CompleteOnboardingAsync(
        CompleteGoogleOnboardingRequest request,
        CancellationToken ct = default)
    {
        ValidatePasswordPair(request.Password, request.ConfirmPassword);

        var fullName = request.FullName.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        var tokenHash = GoogleOnboardingTokenService.HashToken(request.OnboardingToken.Trim());

        var ticket = await db.Set<GoogleOnboardingTicket>()
            .SingleOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

        if (ticket is null)
        {
            throw new AppException(
                401,
                "google_onboarding_token_invalid",
                "Phiếu onboarding Google không hợp lệ hoặc đã hết hiệu lực.");
        }

        // Onboarding không được bỏ qua chính sách mật khẩu (BR-60/103); email lấy từ phiếu.
        PasswordPolicyGuard.Enforce(request.Password, ticket.Email);

        if (ticket.ConsumedAt is not null)
        {
            throw new ConflictException(
                "google_onboarding_token_used",
                "Phiếu onboarding Google đã được sử dụng.");
        }

        if (clock.UtcNow >= ticket.ExpiresAt)
        {
            throw new AppException(
                410,
                "google_onboarding_token_expired",
                "Phiếu onboarding Google đã hết hạn. Hãy đăng nhập Google lại để nhận phiếu mới.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var lockedTicket = await db.Set<GoogleOnboardingTicket>()
            .FromSqlInterpolated(
                $"SELECT * FROM google_onboarding_tickets WHERE ticket_id = {ticket.TicketId} FOR UPDATE")
            .SingleAsync(ct);

        if (lockedTicket.ConsumedAt is not null)
        {
            throw new ConflictException(
                "google_onboarding_token_used",
                "Phiếu onboarding Google đã được sử dụng.");
        }

        if (clock.UtcNow >= lockedTicket.ExpiresAt)
        {
            throw new AppException(
                410,
                "google_onboarding_token_expired",
                "Phiếu onboarding Google đã hết hạn. Hãy đăng nhập Google lại để nhận phiếu mới.");
        }

        if (await db.Set<UserAccount>().AnyAsync(u => u.Email == lockedTicket.Email, ct))
        {
            throw new ConflictException(
                "email_already_exists",
                "Email đã được sử dụng bởi tài khoản khác.");
        }

        if (phone is not null && await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
        {
            throw new PhoneAlreadyExistsException();
        }

        if (await db.Set<UserExternalLogin>().AnyAsync(
                l => l.Provider == ExternalAuthProvider.Google
                     && l.ProviderUserId == lockedTicket.ProviderUserId,
                ct))
        {
            throw new ConflictException(
                "google_identity_already_linked",
                "Tài khoản Google này đã được liên kết.");
        }

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == UserRole.Member, ct);
        var now = clock.UtcNow;

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = lockedTicket.Email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = now,
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(request.Password) },
            Profile = new UserProfile { FullName = fullName, Phone = phone }
        };

        user.ExternalLogins.Add(new UserExternalLogin
        {
            ExternalLoginId = Guid.NewGuid(),
            Provider = ExternalAuthProvider.Google,
            ProviderUserId = lockedTicket.ProviderUserId,
            RefreshToken = null,
            CreatedAt = now
        });

        lockedTicket.ConsumedAt = now;

        db.Set<UserAccount>().Add(user);

        try
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException
                  {
                      SqlState: PostgresErrorCodes.UniqueViolation,
                      ConstraintName: "ix_user_profiles_phone"
                  })
        {
            await transaction.RollbackAsync(ct);
            throw new PhoneAlreadyExistsException();
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            await transaction.RollbackAsync(ct);

            if (await db.Set<UserAccount>().AnyAsync(u => u.Email == lockedTicket.Email, ct))
            {
                throw new ConflictException(
                    "email_already_exists",
                    "Email đã được sử dụng bởi tài khoản khác.");
            }

            throw new ConflictException(
                "google_onboarding_token_used",
                "Phiếu onboarding Google đã được sử dụng.");
        }

        user.Role = role;

        return await BuildAuthResponseAsync(user, isNewAccount: true, ct);
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
                "Hãy đặt mật khẩu trước khi gỡ liên kết Google, nếu không bạn sẽ không đăng nhập được nữa (BR-60).");
        }

        db.Set<UserExternalLogin>().Remove(link);
        await db.SaveChangesAsync(ct);
    }

    private static void ValidatePasswordPair(string password, string confirmPassword)
    {
        if (password != confirmPassword)
        {
            throw new BadRequestException(
                "password_confirmation_mismatch",
                "Mật khẩu và xác nhận mật khẩu không khớp.");
        }
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
