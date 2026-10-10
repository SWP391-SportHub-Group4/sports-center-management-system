using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class MemberCodeTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Only_active_member_can_issue_and_front_desk_can_resolve_a_code()
    {
        var member = await factory.SeedUserAsync($"qr-member-{Guid.NewGuid():N}@example.com", null);
        var coach = await factory.SeedUserAsync($"qr-coach-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var receptionist = await factory.SeedUserAsync($"qr-desk-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        using var client = factory.CreateApiClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/member-codes/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(coach.UserId, UserRole.Coach));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/member-codes/me")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(member.UserId, UserRole.Member));
        using var issued = await client.GetAsync("/api/member-codes/me");
        Assert.Equal(HttpStatusCode.OK, issued.StatusCode);
        using var payload = JsonDocument.Parse(await issued.Content.ReadAsStringAsync());
        var code = payload.RootElement.GetProperty("code").GetString();
        Assert.False(string.IsNullOrWhiteSpace(code));
        Assert.DoesNotContain(member.UserId.ToString("N"), code!, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/member-codes/lookup", new { code })).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(receptionist.UserId, UserRole.Receptionist));
        using var lookedUp = await client.PostAsJsonAsync("/api/member-codes/lookup", new { code });
        Assert.Equal(HttpStatusCode.OK, lookedUp.StatusCode);
        using var resolved = JsonDocument.Parse(await lookedUp.Content.ReadAsStringAsync());
        Assert.Equal(member.UserId.ToString(), resolved.RootElement.GetProperty("userId").GetString());
        Assert.Equal("MEMBER", resolved.RootElement.GetProperty("role").GetString());

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/member-codes/lookup", new { code = "guessed-user-id" })).StatusCode);

        var protection = factory.Services.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("SportHub.MemberLookupCode.v1").ToTimeLimitedDataProtector();
        var expiredCode = protection.Protect(member.UserId.ToString("N"), DateTimeOffset.UtcNow.AddMinutes(-1));
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/member-codes/lookup", new { code = expiredCode })).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.UserAccounts.Where(u => u.UserId == member.UserId)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Banned));
        }
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/member-codes/lookup", new { code })).StatusCode);
    }
}
