using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

public class InitialAdminBootstrapTests
{
    private const string Email = "first-admin@example.com";
    private const string InitialPassword = "Initial-Pass-123!";
    private const string NewPassword = "Replacement-Pass-456!";

    [Fact]
    public async Task Bootstrap_requires_empty_database_and_forces_password_change_before_admin_actions()
    {
        var factory = new SportHubApiFactory();
        await ((IAsyncLifetime)factory).InitializeAsync();
        try
        {
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
                var bootstrap = scope.ServiceProvider.GetRequiredService<InitialAdminBootstrapper>();
                Assert.False(await db.UserAccounts.AnyAsync());
                await bootstrap.BootstrapAsync(Email, InitialPassword);
                await Assert.ThrowsAsync<InvalidOperationException>(() => bootstrap.BootstrapAsync(Email, NewPassword));
                Assert.Single(await db.UserAccounts.ToListAsync());
            }

            var client = factory.CreateApiClient();
            var login = await client.PostAsJsonAsync("api/auth/login", new { email = Email, password = InitialPassword });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var session = JsonDocument.Parse(await login.Content.ReadAsStringAsync()).RootElement;
            Assert.True(session.GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
            // The test host overrides JWT validation after Program binds token issuance options.
            // Issue a token with the verifier's effective options, as the other integration tests do.
            var userId = session.GetProperty("user").GetProperty("userId").GetGuid();
            var oldToken = factory.IssueToken(userId, UserRole.SystemAdministrator);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", oldToken);

            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("api/users/me")).StatusCode);
            var blocked = await client.GetAsync("api/users/admin");
            Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
            Assert.Equal("initial_password_change_required",
                JsonDocument.Parse(await blocked.Content.ReadAsStringAsync()).RootElement.GetProperty("error").GetString());

            var changed = await client.PostAsJsonAsync("api/users/me/password", new
            {
                currentPassword = InitialPassword,
                newPassword = NewPassword,
                confirmNewPassword = NewPassword
            });
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
            Assert.NotEmpty(JsonDocument.Parse(await changed.Content.ReadAsStringAsync()).RootElement
                .GetProperty("accessToken").GetString()!);
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/users/admin")).StatusCode);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
                factory.IssueToken(userId, UserRole.SystemAdministrator));
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("api/users/admin")).StatusCode);

            var me = JsonDocument.Parse(await (await client.GetAsync("api/users/me")).Content.ReadAsStringAsync()).RootElement;
            Assert.False(me.GetProperty("mustChangePassword").GetBoolean());
        }
        finally
        {
            await ((IAsyncLifetime)factory).DisposeAsync();
        }
    }
}
