using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Auth;

public sealed class GoogleAuthService(ISportHubDbContext db, IGoogleTokenVerifier verifier, IOptions<JwtOptions> jwtOptions)
{
    public async Task<GoogleAuthResponse> GoogleLoginAsync(string idToken, CancellationToken ct = default)
    {
        var google = await verifier.VerifyAsync(idToken, ct);
        var login = await db.Set<UserExternalLogin>().Include(x => x.UserAccount)!.ThenInclude(x => x!.Role)
            .SingleOrDefaultAsync(x => x.Provider == ExternalAuthProvider.Google && x.ProviderUserId == google.Subject, ct);
        if (login is not null)
        {
            EnsureActive(login.UserAccount);
            return IssueToken(login.UserAccount!);
        }

        EnsureEmail(google);
        if (await db.Set<UserAccount>().AnyAsync(x => x.Email == google.Email, ct))
            throw new AuthException(409, "GOOGLE_LINK_REQUIRED", "Sign in with your password first, then link Google in Settings.");

        var role = await db.Set<Role>().SingleAsync(x => x.RoleName == UserRole.Member, ct);
        var now = DateTime.UtcNow;
        var account = new UserAccount
        {
            UserId = Guid.NewGuid(), Email = google.Email, RoleId = role.RoleId, Role = role,
            Status = UserStatus.Active, CreatedAt = now,
            Profile = new UserProfile { FullName = google.FullName ?? string.Empty }
        };
        account.ExternalLogins.Add(NewLogin(account.UserId, google.Subject, now));
        db.Set<UserAccount>().Add(account);
        // One SaveChanges atomically inserts the account, profile and external login.
        // Database unique constraints also protect concurrent requests; the HTTP layer maps conflicts.
        await db.SaveChangesAsync(ct);
        return IssueToken(account);
    }

    public async Task LinkGoogleAsync(Guid userId, string idToken, CancellationToken ct = default)
    {
        var account = await db.Set<UserAccount>().SingleOrDefaultAsync(x => x.UserId == userId, ct);
        EnsureActive(account);
        var google = await verifier.VerifyAsync(idToken, ct);
        EnsureEmail(google);
        var existing = await db.Set<UserExternalLogin>().Where(x => x.Provider == ExternalAuthProvider.Google &&
            (x.UserId == userId || x.ProviderUserId == google.Subject)).ToListAsync(ct);
        if (existing.Any(x => x.UserId != userId))
            throw new AuthException(409, "GOOGLE_ALREADY_LINKED", "This Google account is already linked to another account.");
        if (existing.Any(x => x.ProviderUserId != google.Subject))
            throw new AuthException(409, "ACCOUNT_ALREADY_LINKED", "Your account is already linked to a different Google account.");
        if (existing.Count != 0) return; // Retrying the same link is idempotent.

        db.Set<UserExternalLogin>().Add(NewLogin(userId, google.Subject, DateTime.UtcNow));
        await db.SaveChangesAsync(ct);
    }

    private GoogleAuthResponse IssueToken(UserAccount account) => new(account.UserId,
        JwtService.GenerateAccessToken(account.UserId, account.Role!.RoleName.ToString(), jwtOptions.Value));

    private static UserExternalLogin NewLogin(Guid userId, string subject, DateTime now) => new()
    {
        ExternalLoginId = Guid.NewGuid(), UserId = userId, Provider = ExternalAuthProvider.Google,
        ProviderUserId = subject, CreatedAt = now
    };

    private static void EnsureActive(UserAccount? account)
    {
        if (account is null) throw new AuthException(401, "ACCOUNT_NOT_FOUND", "The account does not exist.");
        if (account.Status != UserStatus.Active)
            throw new AuthException(403, "ACCOUNT_NOT_ACTIVE", "The account is not active.");
    }

    private static void EnsureEmail(GoogleIdentity google)
    {
        if (!google.EmailVerified || string.IsNullOrWhiteSpace(google.Email))
            throw new AuthException(403, "GOOGLE_EMAIL_NOT_VERIFIED", "A verified Google email address is required.");
    }
}
