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
        Assert.Contains(json.GetProperty("reasons").EnumerateArray(), r => r.GetString()!.Contains("Point wallet"));

        await SetWalletAsync(member.UserId, available: 0);
        var ok = await admin.PutAsJsonAsync($"api/users/{member.UserId}/role", new { role = "Receptionist", reason = "Hire as receptionist" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Coach_becoming_member_loses_specialties_keeps_profile_and_gets_a_zero_wallet()
    {
        var admin = await AdminAsync();
        var created = await admin.PostAsJsonAsync("api/users", new
        {
            email = NewEmail(), password = Password, fullName = "Coach To Member", role = "Coach", sportIds = new[] { GymSportId }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var coachId = (await Json(created)).GetProperty("userId").GetGuid();

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
}
