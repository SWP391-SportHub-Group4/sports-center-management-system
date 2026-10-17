using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class StaffInvitationExpiryTests(SportHubApiFactory factory)
{
    private const string Password = "New-Staff-Pass-12!";
    private static int _ip;
    private sealed class FixedClock(DateTime now) : IClock { public DateTime UtcNow => now; }

    private HttpClient Client(Guid? adminId = null)
    {
        var client = factory.CreateApiClient();
        var ip = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.97.{ip / 250}.{ip % 250}");
        if (adminId is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
                factory.IssueToken(adminId.Value, UserRole.SystemAdministrator));
        return client;
    }

    private async Task<(Guid Id, string Email, Guid AdminId)> CreateAsync(int roleId = 4, string? email = null,
        Guid? adminId = null, int? sportId = null)
    {
        adminId ??= (await factory.SeedUserAsync($"inviter-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.SystemAdministrator)).UserId;
        email ??= $"expiring-{Guid.NewGuid():N}@example.com";
        using var client = Client(adminId);
        var response = await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email, fullName = "Expiring Staff", roleId,
            specialties = sportId is null ? Array.Empty<int>() : new[] { sportId.Value }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return (json.RootElement.GetProperty("userId").GetGuid(), email, adminId.Value);
    }

    private async Task<DateTime> CreatedAtAsync(Guid id)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SportHubDbContext>().UserAccounts
            .Where(u => u.UserId == id).Select(u => u.CreatedAt).SingleAsync();
    }

    private async Task<bool> ExpireAsync(Guid id, DateTime now)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        return await new StaffInvitationExpiryService(db, new FixedClock(now)).ExpireAsync(id);
    }

    private async Task<HttpResponseMessage> ActivateAsync(string email, string token)
    {
        using var client = Client();
        return await client.PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token, newPassword = Password, confirmNewPassword = Password
        });
    }

    [Fact]
    public async Task Exactly_at_deadline_deletes_account_and_dependencies_and_releases_email_without_reusing_old_link()
    {
        var staff = await CreateAsync();
        var createdAt = await CreatedAtAsync(staff.Id);
        var oldToken = factory.Emails.LatestResetTokenFor(staff.Email);
        Assert.False(await ExpireAsync(staff.Id, createdAt.Add(StaffInvitationExpiryService.InvitationLifetime).AddTicks(-10)));
        Assert.True(await ExpireAsync(staff.Id, createdAt.Add(StaffInvitationExpiryService.InvitationLifetime)));
        Assert.False(await ExpireAsync(staff.Id, createdAt.Add(StaffInvitationExpiryService.InvitationLifetime))); // Idempotent.

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            Assert.False(await db.UserAccounts.AnyAsync(u => u.UserId == staff.Id));
            Assert.False(await db.UserProfiles.AnyAsync(u => u.UserId == staff.Id));
            Assert.False(await db.UserCredentials.AnyAsync(u => u.UserId == staff.Id));
            Assert.False(await db.EmailOtps.AnyAsync(o => o.Email == staff.Email));
            Assert.False(await db.Notifications.AnyAsync(n => n.RecipientAddress == staff.Email));
            Assert.True(await db.AuditLogs.AnyAsync(a => a.TargetId == staff.Id.ToString() && a.Action == "CREATE_STAFF_ACCOUNT"));
            var audit = await db.AuditLogs.SingleAsync(a => a.TargetId == staff.Id.ToString()
                && a.Action == StaffInvitationExpiryService.ExpiryAction);
            Assert.Contains("StaffInvitationExpiryJob", audit.NewValue);
        }
        var replacement = await CreateAsync(email: staff.Email.ToUpperInvariant(), adminId: staff.AdminId);
        Assert.NotEqual(staff.Id, replacement.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await ActivateAsync(staff.Email, oldToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await ActivateAsync(replacement.Email, factory.Emails.LatestResetTokenFor(replacement.Email))).StatusCode);
    }

    [Fact]
    public async Task Coach_profile_and_specialties_are_removed()
    {
        int sportId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var sport = await db.Sports.SingleAsync(s => s.Code == "badminton"); // a coachable sport; Gym has no coach
            sportId = sport.SportId;
        }
        var coach = await CreateAsync(roleId: 2, sportId: sportId);
        Assert.True(await ExpireAsync(coach.Id, (await CreatedAtAsync(coach.Id)).Add(StaffInvitationExpiryService.InvitationLifetime)));
        using var verification = factory.Services.CreateScope();
        var verifyDb = verification.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await verifyDb.CoachProfiles.AnyAsync(c => c.UserId == coach.Id));
        Assert.False(await verifyDb.UserSportSpecialties.AnyAsync(s => s.UserId == coach.Id));
    }

    [Fact]
    public async Task Activated_staff_members_seed_accounts_and_external_logins_are_preserved()
    {
        var activated = await CreateAsync();
        Assert.Equal(HttpStatusCode.NoContent,
            (await ActivateAsync(activated.Email, factory.Emails.LatestResetTokenFor(activated.Email))).StatusCode);
        var seed = await factory.SeedUserAsync($"seed-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var member = await factory.SeedUserAsync($"member-{Guid.NewGuid():N}@example.com", null);
        var linked = await CreateAsync();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.UserExternalLogins.Add(new UserExternalLogin
            {
                ExternalLoginId = Guid.NewGuid(), UserId = linked.Id, Provider = ExternalAuthProvider.Google,
                ProviderUserId = Guid.NewGuid().ToString(), CreatedAt = DateTime.UtcNow
            });
            // Even an incorrect creation audit cannot make a Member eligible.
            db.AuditLogs.Add(new SportHub.Audit.Domain.Entities.AuditLog
            {
                AuditId = Guid.NewGuid(), UserId = linked.AdminId, Action = "CREATE_STAFF_ACCOUNT",
                TargetEntity = nameof(UserAccount), TargetId = member.UserId.ToString(), Timestamp = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }
        foreach (var id in new[] { activated.Id, seed.UserId, member.UserId, linked.Id })
            Assert.False(await ExpireAsync(id, (await CreatedAtAsync(id)).AddDays(8)));
        using var candidatesScope = factory.Services.CreateScope();
        var service = new StaffInvitationExpiryService(candidatesScope.ServiceProvider.GetRequiredService<SportHubDbContext>(),
            new FixedClock(DateTime.UtcNow.AddDays(9)));
        var candidates = await service.FindCandidatesAsync();
        foreach (var id in new[] { activated.Id, seed.UserId, member.UserId, linked.Id })
            Assert.DoesNotContain(id, candidates);
    }

    [Fact]
    public async Task Resending_does_not_restart_invitation_lifetime_and_expired_invitation_cannot_activate_or_resend()
    {
        var staff = await CreateAsync();
        var createdAt = await CreatedAtAsync(staff.Id);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.EmailOtps.Where(o => o.Email == staff.Email).ExecuteUpdateAsync(s => s.SetProperty(o => o.CreatedAt, DateTime.UtcNow.AddMinutes(-5)));
        }
        using var admin = Client(staff.AdminId);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"api/users/{staff.Id}/resend-activation", null)).StatusCode);
        Assert.Equal(createdAt, await CreatedAtAsync(staff.Id));
        var freshToken = factory.Emails.LatestResetTokenFor(staff.Email);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.UserAccounts.Where(u => u.UserId == staff.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.CreatedAt, DateTime.UtcNow.AddDays(-8)));
        }
        var expired = await ActivateAsync(staff.Email, freshToken);
        Assert.Equal(HttpStatusCode.BadRequest, expired.StatusCode);
        Assert.Contains("staff_invitation_expired", await expired.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"api/users/{staff.Id}/resend-activation", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"api/users/{staff.Id}/email",
            new { email = $"changed-{Guid.NewGuid():N}@example.com", reason = "Typo" })).StatusCode);
        using var anonymous = Client();
        Assert.True((await anonymous.PostAsJsonAsync("api/auth/password/forgot", new { email = staff.Email })).IsSuccessStatusCode);
        Assert.Equal(freshToken, factory.Emails.LatestResetTokenFor(staff.Email));
        Assert.True(await ExpireAsync(staff.Id, DateTime.UtcNow));
    }

    [Fact]
    public async Task Account_activated_while_cleanup_waits_for_lock_is_not_deleted()
    {
        var staff = await CreateAsync();
        var expiryTime = (await CreatedAtAsync(staff.Id)).Add(StaffInvitationExpiryService.InvitationLifetime);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        var user = await db.UserAccounts.FromSqlInterpolated($"SELECT * FROM user_accounts WHERE user_id = {staff.Id} FOR UPDATE")
            .SingleAsync();
        var cleanup = ExpireAsync(staff.Id, expiryTime);
        Assert.False(cleanup.IsCompleted);
        await db.UserCredentials.Where(c => c.UserId == user.UserId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.PasswordHash, "activated-password-hash"));
        await tx.CommitAsync();
        Assert.False(await cleanup.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.True(await db.UserAccounts.AnyAsync(u => u.UserId == staff.Id));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public async Task Pending_managers_and_admins_also_expire(int roleId)
    {
        var staff = await CreateAsync(roleId);
        Assert.True(await ExpireAsync(staff.Id, (await CreatedAtAsync(staff.Id)).Add(StaffInvitationExpiryService.InvitationLifetime)));
    }

    [Fact]
    public async Task Unexpected_operational_reference_rolls_back_all_deletions()
    {
        var staff = await CreateAsync();
        var auditId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.AuditLogs.Add(new SportHub.Audit.Domain.Entities.AuditLog
            {
                AuditId = auditId, UserId = staff.Id, Action = "TEST_OPERATIONAL_REFERENCE",
                TargetEntity = "Class", TargetId = "1", Timestamp = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }
        var now = (await CreatedAtAsync(staff.Id)).Add(StaffInvitationExpiryService.InvitationLifetime);
        var failure = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => ExpireAsync(staff.Id, now));
        Assert.Equal("23503", failure.SqlState);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            Assert.True(await db.UserAccounts.AnyAsync(u => u.UserId == staff.Id));
            Assert.True(await db.EmailOtps.AnyAsync(o => o.Email == staff.Email));
            Assert.True(await db.Notifications.AnyAsync(n => n.RecipientAddress == staff.Email));
            Assert.False(await db.AuditLogs.AnyAsync(a => a.TargetId == staff.Id.ToString()
                && a.Action == StaffInvitationExpiryService.ExpiryAction));
            await db.AuditLogs.Where(a => a.AuditId == auditId).ExecuteDeleteAsync();
        }
        Assert.True(await ExpireAsync(staff.Id, now));
    }
}
