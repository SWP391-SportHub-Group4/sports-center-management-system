using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Security.Tests.Integration;

/// <summary>Đổi vai trò Member ↔ Staff: chặn khi còn dữ liệu dở dang (409 kèm lý do), tạo ví 0 điểm khi về Member, gỡ chuyên môn khi rời Coach.</summary>
[Collection(nameof(SportHubApiCollection))]
public class RoleChangeValidationTests(SportHubApiFactory factory)
{
    private const string Password = "Role-Change-Pass-1!";
    private const int GymSportId = 1;
    private static int _ip = 10;

    private static string NewEmail() => $"rc-{Guid.NewGuid():N}@example.com";

    private async Task<HttpClient> AdminAsync()
    {
        var admin = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.SystemAdministrator);
        var client = factory.CreateApiClient();
        var n = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.90.{n / 250}.{n % 250}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(admin.UserId, UserRole.SystemAdministrator));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private async Task SetWalletAsync(Guid userId, int available, int held = 0)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var wallet = await db.Set<PointWallet>().SingleOrDefaultAsync(w => w.OwnerUserId == userId);
        if (wallet is null)
            db.Set<PointWallet>().Add(new PointWallet { WalletId = Guid.NewGuid(), OwnerUserId = userId, AvailablePoints = available, HeldPoints = held, CreatedAtUtc = DateTime.UtcNow });
        else { wallet.AvailablePoints = available; wallet.HeldPoints = held; }
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Member_with_points_cannot_become_staff_until_wallet_is_empty()
    {
        var admin = await AdminAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        await SetWalletAsync(member.UserId, available: 5);

        var blocked = await admin.PutAsJsonAsync($"api/users/{member.UserId}/role", new { role = "Receptionist", reason = "Hire as receptionist" });

        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var json = await Json(blocked);
        Assert.Equal("role_change_blocked", json.GetProperty("error").GetString());
        Assert.Contains(json.GetProperty("reasons").EnumerateArray(),
            r => r.GetString()!.Contains("Point wallet has 5 available point(s)"));

        await SetWalletAsync(member.UserId, available: 0);
        var ok = await admin.PutAsJsonAsync($"api/users/{member.UserId}/role", new { role = "Receptionist", reason = "Hire as receptionist" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Coach_becoming_member_loses_specialties_keeps_profile_and_gets_a_zero_wallet()
    {
        var admin = await AdminAsync();
        var coachId = await SeedCoachAsync();

        var changed = await admin.PutAsJsonAsync($"api/users/{coachId}/role", new { role = "Member", reason = "Returned to member" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.Set<UserSportSpecialty>().AnyAsync(x => x.UserId == coachId));
        Assert.True(await db.Set<CoachProfile>().AnyAsync(x => x.UserId == coachId));
        var wallet = await db.Set<PointWallet>().SingleAsync(w => w.OwnerUserId == coachId);
        Assert.Equal(0, wallet.AvailablePoints);
        Assert.Equal(0, wallet.HeldPoints);
    }

    private async Task<Guid> SeedCoachAsync()
    {
        var coach = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Coach);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.Set<CoachProfile>().Add(new CoachProfile { UserId = coach.UserId });
        db.Set<UserSportSpecialty>().Add(new UserSportSpecialty { UserId = coach.UserId, SportId = GymSportId });
        await db.SaveChangesAsync();
        return coach.UserId;
    }

    private async Task<string[]> BlockedReasonsAsync(HttpClient admin, Guid userId, string role)
    {
        var response = await admin.PutAsJsonAsync($"api/users/{userId}/role", new { role, reason = "Role change check" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var json = await Json(response);
        Assert.Equal("role_change_blocked", json.GetProperty("error").GetString());
        return json.GetProperty("reasons").EnumerateArray().Select(r => r.GetString()!).ToArray();
    }

    [Fact]
    public async Task Member_with_an_active_gym_package_is_blocked()
    {
        var admin = await AdminAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var packageId = await db.Set<SportHub.Membership.Domain.Entities.MembershipPackage>().Select(p => p.PackageId).FirstAsync();
            db.Set<SportHub.Membership.Domain.Entities.MemberPackage>().Add(new SportHub.Membership.Domain.Entities.MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = member.UserId, PackageId = packageId,
                StartDate = DateOnly.FromDateTime(DateTime.UtcNow), EndDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30),
                Status = SportHub.Membership.Domain.Enums.MemberPackageStatus.Active
            });
            await db.SaveChangesAsync();
        }

        Assert.Contains(await BlockedReasonsAsync(admin, member.UserId, "Receptionist"),
            r => r.Contains("Gym membership") && r.Contains("expires") && r.Contains("Center Manager or Receptionist"));
    }

    [Fact]
    public async Task Member_with_an_unpaid_invoice_is_blocked()
    {
        var admin = await AdminAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<SportHub.Payment.Domain.Entities.Invoice>().Add(new SportHub.Payment.Domain.Entities.Invoice
            {
                InvoiceId = Guid.NewGuid(), InvoiceNumber = $"INV-{Guid.NewGuid():N}"[..28], MemberId = member.UserId,
                IssuedByUserId = member.UserId, TotalAmount = 100_000, CashAmount = 100_000, IssuedAt = DateTime.UtcNow,
                Status = SportHub.Payment.Domain.Enums.InvoiceStatus.Issued
            });
            await db.SaveChangesAsync();
        }

        Assert.Contains(await BlockedReasonsAsync(admin, member.UserId, "Coach"), r => r.Contains("unpaid invoice"));
    }

    [Fact]
    public async Task Coach_with_upcoming_assignments_or_active_relationships_is_blocked()
    {
        var admin = await AdminAsync();
        var coachId = await SeedCoachAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<SportHub.Scheduling.Occupancy.Domain.CoachOccupancy>().Add(new SportHub.Scheduling.Occupancy.Domain.CoachOccupancy
            {
                OccupancyId = Guid.NewGuid(), CoachId = coachId, SourceType = SportHub.Scheduling.Occupancy.Domain.OccupancySourceType.PtSession,
                SourceId = Guid.NewGuid(), StartAtUtc = DateTime.UtcNow.AddDays(2), EndAtUtc = DateTime.UtcNow.AddDays(2).AddMinutes(90)
            });
            db.Set<SportHub.Training.Domain.Entities.CoachMemberRelationship>().Add(new SportHub.Training.Domain.Entities.CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = coachId, MemberId = member.UserId,
                SourceType = SportHub.Training.Domain.Enums.RelationshipSourceType.Personal,
                Status = SportHub.Training.Domain.Enums.RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var reasons = await BlockedReasonsAsync(admin, coachId, "Member");
        Assert.Contains(reasons, r => r.Contains("upcoming class/PT session"));
        Assert.Contains(reasons, r => r.Contains("coaching relationship"));
    }
}
