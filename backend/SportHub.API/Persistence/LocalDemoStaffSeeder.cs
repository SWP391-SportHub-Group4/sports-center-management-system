using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.API.Persistence;

/// <summary>Additive, idempotent staff accounts for the local account-management demo.</summary>
public sealed class LocalDemoStaffSeeder(
    SportHubDbContext db,
    IPasswordHasher passwords,
    IClock clock,
    IConfiguration configuration,
    ILogger<LocalDemoStaffSeeder> logger)
{
    private static readonly (string Email, string Name, UserRole Role)[] Staff =
    [
        ("admin.demo1@sporthub.vn", "Quản trị Demo 01", UserRole.SystemAdministrator),
        ("admin.demo2@sporthub.vn", "Quản trị Demo 02", UserRole.SystemAdministrator),
        ("manager.demo@sporthub.vn", "Quản lý Demo", UserRole.CenterManager),
        ("letan.demo@sporthub.vn", "Lễ tân Demo", UserRole.Receptionist)
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var overridePassword = configuration["LocalDemoStaffSeed:Password"];
        var password = overridePassword ?? configuration["Seed:Password"];
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12)
            throw new InvalidOperationException("Set LocalDemoStaffSeed__Password or Seed__Password to a 12+ character local demo password.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var roleIds = await db.Set<Role>().ToDictionaryAsync(x => x.RoleName, x => x.RoleId, ct);
        var created = 0;
        var updated = 0;
        foreach (var (email, name, role) in Staff)
        {
            var existing = await db.Set<UserAccount>().Include(x => x.Role).Include(x => x.Credential)
                .SingleOrDefaultAsync(x => x.Email == email, ct);
            if (existing is not null)
            {
                if (existing.Role?.RoleName != role)
                    throw new InvalidOperationException($"Existing local demo staff account has a different role: {email}.");
                if (existing.Status != UserStatus.Active || string.IsNullOrEmpty(existing.Credential?.PasswordHash))
                    throw new InvalidOperationException($"Local demo staff account is not active with a password: {email}.");
                if (overridePassword is not null && !passwords.Verify(password, existing.Credential.PasswordHash))
                {
                    existing.Credential.PasswordHash = passwords.Hash(password);
                    existing.SecurityStamp = Guid.NewGuid();
                    updated++;
                }
                continue;
            }

            db.Set<UserAccount>().Add(new UserAccount
            {
                UserId = Guid.NewGuid(),
                Email = email,
                RoleId = roleIds[role],
                Status = UserStatus.Active,
                CreatedAt = clock.UtcNow,
                Profile = new UserProfile { FullName = name },
                Credential = new UserCredential { PasswordHash = passwords.Hash(password) }
            });
            created++;
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        logger.LogInformation("Local demo staff ready: {Created} created, {Updated} passwords updated, {Existing} already present.",
            created, updated, Staff.Length - created - updated);
    }
}
