using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class AccountAdministrationStatusTests(SportHubApiFactory factory)
{
    private const string Password = "Account-Status-Pass-1!";
    private static string Email() => $"status-{Guid.NewGuid():N}@example.com";

    private HttpClient Client(UserAccount user, UserRole role)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(user.UserId, role));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Canonical_status_transitions_apply_to_every_role_and_revoke_old_tokens(UserRole role)
    {
        var admin = await factory.SeedUserAsync(Email(), Password, role: UserRole.SystemAdministrator);
        var target = await factory.SeedUserAsync(Email(), Password, role: role);
        using var adminClient = Client(admin, UserRole.SystemAdministrator);
        using var targetClient = Client(target, role);
        var originalStamp = target.SecurityStamp;

        var deactivated = await adminClient.PostAsJsonAsync($"api/users/{target.UserId}/deactivate", new { reason = "Deactivate account" });
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        Assert.Equal("DEACTIVATED", (await Json(deactivated)).GetProperty("status").GetString());
        Assert.NotEqual(originalStamp, factory.StampOf(target.UserId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await targetClient.GetAsync("api/__tests/protected")).StatusCode);

        var deactivatedStamp = factory.StampOf(target.UserId);
        var activated = await adminClient.PostAsJsonAsync($"api/users/{target.UserId}/activate", new { reason = "Restore access" });
        Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
        Assert.Equal("ACTIVE", (await Json(activated)).GetProperty("status").GetString());
        Assert.NotEqual(deactivatedStamp, factory.StampOf(target.UserId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await targetClient.GetAsync("api/__tests/protected")).StatusCode);
        using var freshClient = Client(target, role);
        Assert.Equal(HttpStatusCode.OK, (await freshClient.GetAsync("api/__tests/protected")).StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var actions = await db.AuditLogs.Where(a => a.TargetEntity == nameof(UserAccount) && a.TargetId == target.UserId.ToString())
            .Select(a => a.Action).ToListAsync();
        Assert.Contains("DEACTIVATE_USER_ACCOUNT", actions);
        Assert.Contains("ACTIVATE_USER_ACCOUNT", actions);
        Assert.Equal(2, actions.Count);
    }

    [Fact]
    public async Task Legacy_routes_return_canonical_states_and_repeated_transitions_do_not_create_audit_entries()
    {
        var admin = await factory.SeedUserAsync(Email(), Password, role: UserRole.SystemAdministrator);
        var target = await factory.SeedUserAsync(Email(), Password);
        using var client = Client(admin, UserRole.SystemAdministrator);
        var locked = await client.PostAsJsonAsync($"api/users/{target.UserId}/lock", new { reason = "Old client request" });
        Assert.Equal(HttpStatusCode.OK, locked.StatusCode);
        Assert.Equal("DEACTIVATED", (await Json(locked)).GetProperty("status").GetString());
        var stamp = factory.StampOf(target.UserId);
        var repeat = await client.PostAsJsonAsync($"api/users/{target.UserId}/deactivate", new { reason = "Already deactivated" });
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal(stamp, factory.StampOf(target.UserId));
        var unlocked = await client.PostAsJsonAsync($"api/users/{target.UserId}/unlock", new { reason = "Old client restore" });
        Assert.Equal(HttpStatusCode.OK, unlocked.StatusCode);
        Assert.Equal("ACTIVE", (await Json(unlocked)).GetProperty("status").GetString());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(2, await db.AuditLogs.CountAsync(a => a.TargetEntity == nameof(UserAccount) && a.TargetId == target.UserId.ToString()));
    }

    [Fact]
    public async Task Status_filters_return_canonical_values_and_pending_activation_remains_separate()
    {
        var admin = await factory.SeedUserAsync(Email(), Password, role: UserRole.SystemAdministrator);
        var marker = Guid.NewGuid().ToString("N");
        var active = await factory.SeedUserAsync($"status-active-{marker}@example.com", Password);
        var inactive = await factory.SeedUserAsync($"status-inactive-{marker}@example.com", Password, UserStatus.Deactivated);
        var pending = await factory.SeedUserAsync($"status-pending-{marker}@example.com", null, role: UserRole.Receptionist);
        using var client = Client(admin, UserRole.SystemAdministrator);

        foreach (var status in new[] { "DEACTIVATED", "BANNED" })
        {
            var response = await client.GetAsync($"api/users/admin?keyword={marker}&status={status}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var item = Assert.Single((await Json(response)).GetProperty("items").EnumerateArray());
            Assert.Equal(inactive.UserId, item.GetProperty("userId").GetGuid());
            Assert.Equal("DEACTIVATED", item.GetProperty("status").GetString());
        }
        var activeItems = (await Json(await client.GetAsync($"api/users/admin?keyword={marker}&status=ACTIVE")))
            .GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, activeItems.Length);
        Assert.Contains(activeItems, item => item.GetProperty("userId").GetGuid() == active.UserId);
        Assert.All(activeItems, item => Assert.Equal("ACTIVE", item.GetProperty("status").GetString()));
        var invitation = Assert.Single((await Json(await client.GetAsync($"api/users/admin?keyword={marker}&status=ACTIVATION_REQUIRED")))
            .GetProperty("items").EnumerateArray());
        Assert.Equal(pending.UserId, invitation.GetProperty("userId").GetGuid());
        Assert.Equal("ACTIVE", invitation.GetProperty("status").GetString());
        Assert.True(invitation.GetProperty("activationPending").GetBoolean());
    }

    [Fact]
    public async Task Administrators_cannot_deactivate_themselves_and_members_cannot_change_account_status()
    {
        var admin = await factory.SeedUserAsync(Email(), Password, role: UserRole.SystemAdministrator);
        var member = await factory.SeedUserAsync(Email(), Password);
        using var adminClient = Client(admin, UserRole.SystemAdministrator);
        var self = await adminClient.PostAsJsonAsync($"api/users/{admin.UserId}/deactivate", new { reason = "Self deactivation" });
        Assert.Equal(HttpStatusCode.Forbidden, self.StatusCode);
        Assert.Equal("cannot_deactivate_self", (await Json(self)).GetProperty("error").GetString());
        using var memberClient = Client(member, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsJsonAsync($"api/users/{admin.UserId}/deactivate",
            new { reason = "Unauthorized deactivation" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsJsonAsync($"api/users/{admin.UserId}/activate",
            new { reason = "Unauthorized activation" })).StatusCode);
        Assert.Equal(admin.SecurityStamp, factory.StampOf(admin.UserId));
    }

    [Fact]
    public async Task Concurrent_administrators_cannot_both_deactivate_each_other()
    {
        var first = await factory.SeedUserAsync(Email(), Password, role: UserRole.SystemAdministrator);
        var second = await factory.SeedUserAsync(Email(), Password, role: UserRole.SystemAdministrator);
        using var firstClient = Client(first, UserRole.SystemAdministrator);
        using var secondClient = Client(second, UserRole.SystemAdministrator);
        var responses = await Task.WhenAll(
            firstClient.PostAsJsonAsync($"api/users/{second.UserId}/deactivate", new { reason = "First administrator request" }),
            secondClient.PostAsJsonAsync($"api/users/{first.UserId}/deactivate", new { reason = "Second administrator request" }));
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, response => response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => (u.UserId == first.UserId || u.UserId == second.UserId)
            && u.Status == UserStatus.Active));
    }
}
