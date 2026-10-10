using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Đăng nhập Google theo docs/SportManagement_BusinessRules_v2.0_updated.docx, mục P: tự tạo tài khoản (password_hash = NULL) và
/// tự liên kết tài khoản có sẵn theo email Google đã xác minh. Không còn bước onboarding.
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public class GoogleLoginTests(SportHubApiFactory factory)
{
    private HttpClient ClientFor(string ip)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, ip);
        return client;
    }

    private static HttpContent GoogleBody(string subject, string email, string? name = "Google User")
        => JsonContent.Create(new { idToken = FakeGoogleTokenVerifier.Token(subject, email, name!) });

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task New_google_email_creates_a_member_account_immediately_without_a_password()
    {
        var client = ClientFor("10.40.0.1");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var response = await client.PostAsync("api/auth/google", GoogleBody(subject, email, "Nguyen Van Google"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await JsonOf(response);
        Assert.True(json.GetProperty("isNewAccount").GetBoolean());
        Assert.True(json.GetProperty("accessToken").GetString()!.Length > 20);
        Assert.False(json.TryGetProperty("onboardingToken", out _));

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var user = await db.UserAccounts
            .Include(u => u.Role)
            .Include(u => u.Credential)
            .Include(u => u.Profile)
            .Include(u => u.ExternalLogins)
            .SingleAsync(u => u.Email == email);

        Assert.Equal(UserRole.Member, user.Role!.RoleName);
        Assert.Equal(UserStatus.Active, user.Status);
        Assert.Null(user.Credential?.PasswordHash);
        Assert.Equal("Nguyen Van Google", user.Profile!.FullName);
        Assert.Null(user.Profile.Phone);
        Assert.Equal(subject, user.ExternalLogins.Single().ProviderUserId);
    }

    [Fact]
    public async Task Missing_google_name_falls_back_to_the_email_local_part()
    {
        var subject = Guid.NewGuid().ToString("N");
        var email = $"fallback-{subject}@example.com";

        var response = await ClientFor("10.40.0.2").PostAsync("api/auth/google", GoogleBody(subject, email, name: ""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var profile = await db.UserProfiles.SingleAsync(p => p.UserAccount!.Email == email);
        Assert.Equal($"fallback-{subject}", profile.FullName);
    }

    [Fact]
    public async Task Returning_google_login_signs_in_the_same_account()
    {
        var client = ClientFor("10.40.0.3");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var again = await client.PostAsync("api/auth/google", GoogleBody(subject, email));

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.False((await JsonOf(again)).GetProperty("isNewAccount").GetBoolean());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => u.Email == email));
        Assert.Equal(1, await db.UserExternalLogins.CountAsync(l => l.ProviderUserId == subject));
    }

    [Fact]
    public async Task Existing_email_password_account_is_linked_automatically_by_email()
    {
        var email = $"g-existing-{Guid.NewGuid():N}@example.com";
        var subject = Guid.NewGuid().ToString("N");
        var user = await factory.SeedUserAsync(email, "CorrectHorse1!");

        var response = await ClientFor("10.40.0.4").PostAsync("api/auth/google", GoogleBody(subject, email));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await JsonOf(response);
        Assert.False(json.GetProperty("isNewAccount").GetBoolean());
        Assert.Equal(user.UserId, json.GetProperty("user").GetProperty("userId").GetGuid());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => u.Email == email));
        var link = await db.UserExternalLogins.SingleAsync(l => l.UserId == user.UserId);
        Assert.Equal(subject, link.ProviderUserId);

        // Mật khẩu cũ vẫn dùng được: tài khoản đăng nhập được bằng cả hai cách.
        var password = await ClientFor("10.40.0.5")
            .PostAsync("api/auth/login", JsonContent.Create(new { email, password = "CorrectHorse1!" }));
        Assert.Equal(HttpStatusCode.OK, password.StatusCode);
    }

    [Fact]
    public async Task Email_match_is_case_insensitive()
    {
        var email = $"g-case-{Guid.NewGuid():N}@example.com";
        var user = await factory.SeedUserAsync(email, "CorrectHorse1!");

        var response = await ClientFor("10.40.0.6").PostAsync(
            "api/auth/google", GoogleBody(Guid.NewGuid().ToString("N"), email.ToUpperInvariant()));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(user.UserId, (await JsonOf(response)).GetProperty("user").GetProperty("userId").GetGuid());
    }

    [Fact]
    public async Task Account_already_linked_to_another_google_identity_is_not_overwritten()
    {
        var email = $"g-mismatch-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(email, "CorrectHorse1!");

        var first = await ClientFor("10.40.0.7").PostAsync("api/auth/google", GoogleBody(Guid.NewGuid().ToString("N"), email));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var other = await ClientFor("10.40.0.8").PostAsync("api/auth/google", GoogleBody(Guid.NewGuid().ToString("N"), email));

        Assert.Equal(HttpStatusCode.Conflict, other.StatusCode);
        Assert.Contains("google_identity_mismatch", await other.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task Inactive_or_banned_account_is_not_linked_and_gets_no_token(UserStatus status)
    {
        var email = $"g-blocked-{Guid.NewGuid():N}@example.com";
        var user = await factory.SeedUserAsync(email, "CorrectHorse1!", status);

        var response = await ClientFor("10.40.0.9").PostAsync(
            "api/auth/google", GoogleBody(Guid.NewGuid().ToString("N"), email));

        Assert.False(response.IsSuccessStatusCode);
        Assert.DoesNotContain("accessToken", await response.Content.ReadAsStringAsync());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.UserExternalLogins.AnyAsync(l => l.UserId == user.UserId));
    }

    [Fact]
    public async Task Google_only_account_cannot_sign_in_with_a_password()
    {
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";
        await ClientFor("10.40.0.10").PostAsync("api/auth/google", GoogleBody(subject, email));

        var login = await ClientFor("10.40.0.11")
            .PostAsync("api/auth/login", JsonContent.Create(new { email, password = "AnyPassword1!" }));

        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task Old_onboarding_endpoint_no_longer_exists()
    {
        var response = await ClientFor("10.40.0.12").PostAsync(
            "api/auth/google/onboarding", JsonContent.Create(new { onboardingToken = "x" }));

        Assert.False(response.IsSuccessStatusCode);
        Assert.DoesNotContain("accessToken", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Concurrent_first_logins_create_exactly_one_account()
    {
        var client = ClientFor("10.40.0.13");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var first = client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var second = client.PostAsync("api/auth/google", GoogleBody(subject, email));
        await Task.WhenAll(first, second);

        var statuses = new[] { first.Result.StatusCode, second.Result.StatusCode };
        Assert.Contains(HttpStatusCode.OK, statuses);
        Assert.All(statuses, s => Assert.True(s is HttpStatusCode.OK or HttpStatusCode.Conflict));

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => u.Email == email));
    }

    [Fact]
    public async Task Responses_and_logs_do_not_leak_secrets()
    {
        var client = ClientFor("10.40.0.14");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";
        var idToken = FakeGoogleTokenVerifier.Token(subject, email, "Google User");

        var response = await client.PostAsync("api/auth/google", JsonContent.Create(new { idToken }));
        var body = await response.Content.ReadAsStringAsync();

        Assert.DoesNotContain("passwordHash", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("suggestedPassword", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(idToken, body);

        while (factory.Logs.TryDequeue(out var logLine))
        {
            Assert.DoesNotContain(idToken, logLine);
        }
    }
}
