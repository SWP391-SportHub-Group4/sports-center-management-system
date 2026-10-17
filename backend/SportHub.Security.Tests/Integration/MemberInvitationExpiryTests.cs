using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Administration.Application.Services;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>A member registered at the desk who never activates leaves the system after a week; anything given to them keeps the account.</summary>
[Collection(nameof(SportHubApiCollection))]
public sealed class MemberInvitationExpiryTests(SportHubApiFactory factory)
{
    private static int _ip;
    private sealed class FixedClock(DateTime now) : IClock { public DateTime UtcNow => now; }

    private async Task<(HttpClient Desk, Guid DeskId, Guid MemberId, string Email)> RegisterAsync()
    {
        var staff = await factory.SeedUserAsync($"desk-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        var client = factory.CreateApiClient();
        var ip = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.98.{ip / 250}.{ip % 250}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(staff.UserId, UserRole.Receptionist));
        var email = $"pending-{Guid.NewGuid():N}@example.com";
        var created = await client.PostAsJsonAsync("api/members/front-desk", new { email, fullName = "Pending Member" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        return (client, staff.UserId, json.RootElement.GetProperty("userId").GetGuid(), email);
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
        return await new MemberInvitationExpiryService(db, new FixedClock(now)).ExpireAsync(id);
    }

    [Fact]
    public async Task A_member_still_pending_after_seven_days_is_removed_and_the_email_is_free_again()
    {
        var member = await RegisterAsync();
        var createdAt = await CreatedAtAsync(member.MemberId);

        Assert.False(await ExpireAsync(member.MemberId, createdAt.Add(MemberInvitationExpiryService.PendingLifetime).AddTicks(-10)));
        Assert.True(await ExpireAsync(member.MemberId, createdAt.Add(MemberInvitationExpiryService.PendingLifetime)));
        Assert.False(await ExpireAsync(member.MemberId, createdAt.AddDays(8))); // idempotent

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            Assert.False(await db.UserAccounts.AnyAsync(u => u.UserId == member.MemberId));
            Assert.False(await db.UserProfiles.AnyAsync(u => u.UserId == member.MemberId));
            Assert.False(await db.EmailOtps.AnyAsync(o => o.Email == member.Email));
            Assert.False(await db.Set<SportHub.Payment.Wallet.Domain.PointWallet>().AnyAsync(w => w.OwnerUserId == member.MemberId));
            // The registration record stays, and the removal is attributed to the system.
            Assert.True(await db.AuditLogs.AnyAsync(a => a.TargetId == member.MemberId.ToString() && a.Action == "FRONT_DESK_CREATE_MEMBER"));
            var audit = await db.AuditLogs.SingleAsync(a => a.TargetId == member.MemberId.ToString()
                && a.Action == MemberInvitationExpiryService.ExpiryAction);
            Assert.Equal("SYSTEM", audit.ActorRole);
            Assert.Contains("MemberInvitationExpiryJob", audit.NewValue);
        }

        // The same email can be registered again.
        var again = await member.Desk.PostAsJsonAsync("api/members/front-desk", new { email = member.Email.ToUpperInvariant(), fullName = "Pending Member" });
        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
    }

    [Fact]
    public async Task Fixing_a_wrong_email_does_not_extend_the_seven_days()
    {
        var member = await RegisterAsync();
        var createdAt = await CreatedAtAsync(member.MemberId);
        var rightEmail = $"right-{Guid.NewGuid():N}@example.com";

        var changed = await member.Desk.PutAsJsonAsync($"api/members/front-desk/{member.MemberId}/email",
            new { email = rightEmail, reason = "Typo at the desk" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        Assert.True(await ExpireAsync(member.MemberId, createdAt.Add(MemberInvitationExpiryService.PendingLifetime)));
        using var scope = factory.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<SportHubDbContext>().EmailOtps.AnyAsync(o => o.Email == rightEmail));
    }

    [Fact]
    public async Task A_member_who_was_given_something_at_the_desk_is_kept_and_keeps_waiting()
    {
        var member = await RegisterAsync();
        var createdAt = await CreatedAtAsync(member.MemberId);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<Invoice>().Add(new Invoice
            {
                InvoiceId = Guid.NewGuid(), InvoiceNumber = $"INV-{Guid.NewGuid():N}"[..20], MemberId = member.MemberId,
                IssuedByUserId = member.DeskId, TotalAmount = 50_000m, Status = InvoiceStatus.Issued, IssuedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        Assert.False(await ExpireAsync(member.MemberId, createdAt.AddDays(30)));

        using var verify = factory.Services.CreateScope();
        Assert.True(await verify.ServiceProvider.GetRequiredService<SportHubDbContext>().UserAccounts.AnyAsync(u => u.UserId == member.MemberId));
        var candidates = await new MemberInvitationExpiryService(
            verify.ServiceProvider.GetRequiredService<SportHubDbContext>(), new FixedClock(createdAt.AddDays(30))).FindCandidatesAsync();
        Assert.DoesNotContain(member.MemberId, candidates);
    }

    [Fact]
    public async Task A_member_who_activated_is_never_removed()
    {
        var member = await RegisterAsync();
        var createdAt = await CreatedAtAsync(member.MemberId);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var credential = await db.UserCredentials.SingleAsync(c => c.UserId == member.MemberId);
            credential.PasswordHash = "activated-hash";
            await db.SaveChangesAsync();
        }

        Assert.False(await ExpireAsync(member.MemberId, createdAt.AddDays(30)));
    }
}
