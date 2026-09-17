using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class AccountStatusJwtTests(SportHubApiFactory factory)
{
    private HttpClient Client()
    {
        TestProtectedController.ResetActionExecuted();
        factory.Spy.Reset();
        return factory.CreateApiClient();
    }

    private static HttpRequestMessage Protected(string? token, string path = "api/__tests/protected")
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);

        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return request;
    }

    [Fact]
    public async Task Active_user_can_call_protected_endpoint()
    {
        var user = await factory.SeedUserAsync($"active-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        var client = Client();

        var response = await client.SendAsync(Protected(factory.IssueToken(user.UserId, UserRole.Member)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(TestProtectedController.ActionExecuted);
    }

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task Same_token_is_rejected_after_status_change_is_committed(UserStatus status)
    {
        var user = await factory.SeedUserAsync($"blocked-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        var token = factory.IssueToken(user.UserId, UserRole.Member);

        var client = Client();
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Protected(token))).StatusCode);

        await factory.SetStatusAsync(user.UserId, status);

        var afterBlock = Client();
        var response = await afterBlock.SendAsync(Protected(token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(TestProtectedController.ActionExecuted);

        // Giu nguyen body 401 chung cua OnChallenge — khong lo trang thai tai khoan.
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("unauthorized", body);
        Assert.DoesNotContain("banned", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("deactivated", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Token_of_nonexistent_user_is_rejected()
    {
        // Test phong thu bang GUID khong co trong DB — khong them flow xoa cung account.
        var client = Client();

        var response = await client.SendAsync(Protected(factory.IssueToken(Guid.NewGuid(), UserRole.Member)));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(TestProtectedController.ActionExecuted);
    }

    [Fact]
    public async Task Unblocking_lets_the_same_unexpired_token_work_again()
    {
        // Chot ngu nghia da thong nhat cua task: KHONG thu hoi token vinh vien.
        var user = await factory.SeedUserAsync($"unblock-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        var token = factory.IssueToken(user.UserId, UserRole.Member);

        await factory.SetStatusAsync(user.UserId, UserStatus.Banned);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().SendAsync(Protected(token))).StatusCode);

        await factory.SetStatusAsync(user.UserId, UserStatus.Active);
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Protected(token))).StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task No_role_bypasses_the_status_check(UserRole role)
    {
        // BR-2/BR-3: khong mien tru role nao, ke ca SystemAdministrator.
        var user = await factory.SeedUserAsync($"role-{Guid.NewGuid():N}@example.com", "CorrectHorse1", role: role);
        var token = factory.IssueToken(user.UserId, role);

        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Protected(token))).StatusCode);

        await factory.SetStatusAsync(user.UserId, UserStatus.Banned);

        var response = await Client().SendAsync(Protected(token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(TestProtectedController.ActionExecuted);
    }

    [Fact]
    public async Task Token_without_user_id_is_rejected_without_touching_the_database()
    {
        var token = JwtService.GenerateToken(
            [new Claim(ClaimTypes.Role, nameof(UserRole.Member))],
            factory.EffectiveJwtOptions);

        var client = Client();
        var response = await client.SendAsync(Protected(token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, factory.Spy.IsActiveCalls);
        Assert.False(TestProtectedController.ActionExecuted);
    }

    [Fact]
    public async Task Token_with_non_guid_user_id_is_rejected_without_touching_the_database()
    {
        var token = JwtService.GenerateToken(
            [new Claim(ClaimTypes.NameIdentifier, "not-a-guid"), new Claim(ClaimTypes.Role, nameof(UserRole.Member))],
            factory.EffectiveJwtOptions);

        var response = await Client().SendAsync(Protected(token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, factory.Spy.IsActiveCalls);
    }

    [Fact]
    public async Task Expired_token_is_rejected_before_the_status_check()
    {
        var user = await factory.SeedUserAsync($"expired-{Guid.NewGuid():N}@example.com", "CorrectHorse1");

        var expiredOptions = factory.EffectiveJwtOptions;
        expiredOptions.AccessTokenExpiryMinutes = -10; // qua ca ClockSkew 1 phut

        var token = JwtService.GenerateAccessToken(user.UserId, nameof(UserRole.Member), expiredOptions);

        var response = await Client().SendAsync(Protected(token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, factory.Spy.IsActiveCalls);
    }

    [Fact]
    public async Task Token_with_wrong_signature_is_rejected_before_the_status_check()
    {
        var user = await factory.SeedUserAsync($"badsig-{Guid.NewGuid():N}@example.com", "CorrectHorse1");

        var forgedOptions = factory.EffectiveJwtOptions;
        forgedOptions.SecretKey = "a-completely-different-secret-key-also-long-enough-64!!";

        var token = JwtService.GenerateAccessToken(user.UserId, nameof(UserRole.Member), forgedOptions);

        var response = await Client().SendAsync(Protected(token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, factory.Spy.IsActiveCalls);
    }

    [Fact]
    public async Task Active_user_with_wrong_role_still_gets_403_from_the_existing_handler()
    {
        var user = await factory.SeedUserAsync($"wrongrole-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        var token = factory.IssueToken(user.UserId, UserRole.Member);

        var response = await Client().SendAsync(Protected(token, "api/__tests/manager-only"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("forbidden", await response.Content.ReadAsStringAsync());
        Assert.False(TestProtectedController.ActionExecuted);
    }

    [Fact]
    public async Task Database_failure_fails_closed_and_never_runs_the_action()
    {
        var user = await factory.SeedUserAsync($"dbfail-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        var token = factory.IssueToken(user.UserId, UserRole.Member);

        var client = Client();
        factory.Spy.ThrowOnIsActive = true;

        try
        {
            var response = await client.SendAsync(Protected(token));

            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            Assert.False(TestProtectedController.ActionExecuted);

            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("internal_server_error", body);
            Assert.DoesNotContain("Simulated database failure", body);
        }
        finally
        {
            factory.Spy.ThrowOnIsActive = false;
        }
    }

    [Fact]
    public async Task Public_endpoint_works_without_token_and_with_a_blocked_users_token()
    {
        var user = await factory.SeedUserAsync($"pub-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        var token = factory.IssueToken(user.UserId, UserRole.Member);
        await factory.SetStatusAsync(user.UserId, UserStatus.Banned);

        var client = Client();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("api/__tests/public")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Protected(token, "api/__tests/public"))).StatusCode);
    }
}
