using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.API.Persistence;

/// <summary>Explicit, one-time recovery path for a newly migrated, empty database.</summary>
public sealed class InitialAdminBootstrapper(SportHubDbContext db, IPasswordHasher passwords)
{
    public async Task BootstrapAsync(string? email, string? password, CancellationToken ct = default)
    {
        email = email?.Trim();
        if (string.IsNullOrWhiteSpace(email) || !new EmailAddressAttribute().IsValid(email))
            throw new InvalidOperationException("Set InitialAdmin__Email to the initial administrator's real email.");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12)
            throw new InvalidOperationException("Set InitialAdmin__Password in the process environment (12+ characters).");
        PasswordPolicyGuard.Enforce(password, email);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize bootstrap commands and block account registration until the empty check commits.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026102201)", ct);
        await db.Database.ExecuteSqlRawAsync("LOCK TABLE user_accounts IN SHARE ROW EXCLUSIVE MODE", ct);
        if (await db.UserAccounts.AnyAsync(ct))
            throw new InvalidOperationException("Initial administrator bootstrap requires an empty user_accounts table.");

        var role = await db.Roles.SingleAsync(r => r.RoleName == UserRole.SystemAdministrator, ct);
        db.UserAccounts.Add(new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = DateTime.UtcNow,
            MustChangePassword = true,
            Credential = new UserCredential { PasswordHash = passwords.Hash(password) },
            Profile = new UserProfile { FullName = "Initial Administrator" }
        });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
