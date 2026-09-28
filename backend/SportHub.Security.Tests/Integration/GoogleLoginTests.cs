using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Infrastructure.Security;

namespace SportHub.Security.Tests.Integration;

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
        => JsonContent.Create(new { idToken = FakeGoogleTokenVerifier.Token(subject, email, name) });

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static object OnboardingBody(
        string onboardingToken,
        string password,
        string? confirmPassword = null,
        string fullName = "Nguyen Van A",
        string? phone = null)
        => new
        {
            onboardingToken,
            fullName,
            phone,
            password,
            confirmPassword = confirmPassword ?? password
        };

    [Fact]
    public async Task Linked_google_identity_returns_200_with_jwt_and_no_onboarding()
    {
        var client = ClientFor("10.40.0.1");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        Assert.Equal(HttpStatusCode.Accepted, pending.StatusCode);
        var token = (await JsonOf(pending)).GetProperty("onboardingToken").GetString()!;
        var complete = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(token, "MySecurePass1")));
        Assert.Equal(HttpStatusCode.Created, complete.StatusCode);

        var again = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var json = await JsonOf(again);
        Assert.False(json.GetProperty("isNewAccount").GetBoolean());
        Assert.True(json.TryGetProperty("accessToken", out var jwt) && jwt.GetString()!.Length > 20);
        Assert.False(json.TryGetProperty("onboardingToken", out _));
        Assert.False(json.TryGetProperty("suggestedPassword", out _));
    }

    [Fact]
    public async Task New_google_email_returns_202_and_does_not_create_account_yet()
    {
        var client = ClientFor("10.40.0.2");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var response = await client.PostAsync("api/auth/google", GoogleBody(subject, email));

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var json = await JsonOf(response);
        Assert.True(json.GetProperty("requiresOnboarding").GetBoolean());
        Assert.True(json.GetProperty("onboardingToken").GetString()!.Length >= 32);
        Assert.Equal(email, json.GetProperty("email").GetString());
        Assert.False(json.TryGetProperty("accessToken", out _));
        Assert.False(json.TryGetProperty("suggestedPassword", out _));

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.UserAccounts.AnyAsync(u => u.Email == email));
        Assert.False(await db.UserExternalLogins.AnyAsync(l => l.ProviderUserId == subject));
        Assert.Equal(1, await db.GoogleOnboardingTickets.CountAsync(t => t.ProviderUserId == subject));
    }

    [Fact]
    public async Task Complete_onboarding_creates_account_credential_profile_external_login_and_jwt()
    {
        var client = ClientFor("10.40.0.3");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";
        const string password = "UserChosenPass1";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var onboardingToken = (await JsonOf(pending)).GetProperty("onboardingToken").GetString()!;

        var complete = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(onboardingToken, password, phone: "0901234567")));

        Assert.Equal(HttpStatusCode.Created, complete.StatusCode);
        var auth = await JsonOf(complete);
        Assert.True(auth.GetProperty("isNewAccount").GetBoolean());
        Assert.False(auth.TryGetProperty("suggestedPassword", out _));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var user = await db.UserAccounts
                .Include(u => u.Credential)
                .Include(u => u.Profile)
                .Include(u => u.ExternalLogins)
                .SingleAsync(u => u.Email == email);

            Assert.NotNull(user.Credential?.PasswordHash);
            Assert.Equal("Nguyen Van A", user.Profile!.FullName);
            Assert.Equal("0901234567", user.Profile.Phone);
            Assert.Single(user.ExternalLogins);
            Assert.Equal(subject, user.ExternalLogins.Single().ProviderUserId);

            var ticket = await db.GoogleOnboardingTickets.SingleAsync(t => t.ProviderUserId == subject);
            Assert.NotNull(ticket.ConsumedAt);
        }

        var login = await client.PostAsync("api/auth/login", JsonContent.Create(new { email, password }));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Password_confirmation_mismatch_does_not_create_account()
    {
        var client = ClientFor("10.40.0.4");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var onboardingToken = (await JsonOf(pending)).GetProperty("onboardingToken").GetString()!;

        var response = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1", confirmPassword: "OtherPass1")));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("password_confirmation_mismatch", body);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.UserAccounts.AnyAsync(u => u.Email == email));
        var ticket = await db.GoogleOnboardingTickets.SingleAsync(t => t.ProviderUserId == subject);
        Assert.Null(ticket.ConsumedAt);
    }

    [Fact]
    public async Task Invalid_expired_and_used_tokens_do_not_create_accounts()
    {
        var client = ClientFor("10.40.0.5");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var onboardingToken = (await JsonOf(pending)).GetProperty("onboardingToken").GetString()!;

        var invalid = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody("not-a-real-token", "MySecurePass1")));
        Assert.Equal(HttpStatusCode.Unauthorized, invalid.StatusCode);
        Assert.Contains("google_onboarding_token_invalid", await invalid.Content.ReadAsStringAsync());

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var ticket = await db.GoogleOnboardingTickets.SingleAsync(t => t.ProviderUserId == subject);
            ticket.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var expired = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1")));
        Assert.Equal((HttpStatusCode)410, expired.StatusCode);
        Assert.Contains("google_onboarding_token_expired", await expired.Content.ReadAsStringAsync());

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var ticket = await db.GoogleOnboardingTickets.SingleAsync(t => t.ProviderUserId == subject);
            ticket.ExpiresAt = DateTime.UtcNow.AddMinutes(10);
            ticket.ConsumedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        var used = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1")));
        Assert.Equal(HttpStatusCode.Conflict, used.StatusCode);
        Assert.Contains("google_onboarding_token_used", await used.Content.ReadAsStringAsync());

        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await verifyDb.UserAccounts.AnyAsync(u => u.Email == email));
    }

    [Fact]
    public async Task Concurrent_completion_only_one_succeeds()
    {
        var client = ClientFor("10.40.0.6");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var onboardingToken = (await JsonOf(pending)).GetProperty("onboardingToken").GetString()!;

        var body = JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1"));
        var first = client.PostAsync("api/auth/google/onboarding", body);
        var second = client.PostAsync("api/auth/google/onboarding", JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1")));
        await Task.WhenAll(first, second);

        var statuses = new[] { first.Result.StatusCode, second.Result.StatusCode };
        Assert.Equal(1, statuses.Count(s => s == HttpStatusCode.Created));
        Assert.Equal(1, statuses.Count(s => s is HttpStatusCode.Conflict or HttpStatusCode.BadRequest));

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => u.Email == email));
    }

    [Fact]
    public async Task Existing_unlinked_email_is_still_409_and_not_linked()
    {
        var email = $"g-existing-{Guid.NewGuid():N}@example.com";
        var user = await factory.SeedUserAsync(email, "CorrectHorse1");

        var response = await ClientFor("10.40.0.7")
            .PostAsync("api/auth/google", GoogleBody(Guid.NewGuid().ToString("N"), email));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("google_account_not_linked", body);
        Assert.DoesNotContain("suggestedPassword", body);
        Assert.DoesNotContain("onboardingToken", body);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.UserExternalLogins.AnyAsync(l => l.UserId == user.UserId));
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => u.Email == email));
    }

    [Fact]
    public async Task Duplicate_phone_rolls_back_and_leaves_ticket_unconsumed()
    {
        var existing = await factory.SeedUserAsync($"phone-owner-{Guid.NewGuid():N}@example.com", "CorrectHorse1");
        using (var seedScope = factory.Services.CreateScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var profile = await seedDb.UserProfiles.SingleAsync(p => p.UserId == existing.UserId);
            profile.Phone = "0901111222";
            await seedDb.SaveChangesAsync();
        }

        var client = ClientFor("10.40.0.8");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var onboardingToken = (await JsonOf(pending)).GetProperty("onboardingToken").GetString()!;

        var response = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1", phone: "0901111222")));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("phone_already_exists", await response.Content.ReadAsStringAsync());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.UserAccounts.AnyAsync(u => u.Email == email));
        var ticket = await db.GoogleOnboardingTickets.SingleAsync(t => t.ProviderUserId == subject);
        Assert.Null(ticket.ConsumedAt);
    }

    [Fact]
    public async Task New_google_login_invalidates_previous_unused_ticket_for_same_subject()
    {
        var client = ClientFor("10.40.0.9");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var first = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var oldToken = (await JsonOf(first)).GetProperty("onboardingToken").GetString()!;

        var second = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        Assert.Equal(HttpStatusCode.Accepted, second.StatusCode);
        var newToken = (await JsonOf(second)).GetProperty("onboardingToken").GetString()!;

        var oldAttempt = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(oldToken, "MySecurePass1")));
        Assert.Equal(HttpStatusCode.Conflict, oldAttempt.StatusCode);
        Assert.Contains("google_onboarding_token_used", await oldAttempt.Content.ReadAsStringAsync());

        var newAttempt = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(newToken, "MySecurePass1")));
        Assert.Equal(HttpStatusCode.Created, newAttempt.StatusCode);
    }

    [Fact]
    public async Task Responses_and_errors_do_not_leak_secrets()
    {
        var client = ClientFor("10.40.0.10");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var pending = await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var pendingBody = await pending.Content.ReadAsStringAsync();
        Assert.DoesNotContain(GoogleOnboardingTokenService.HashToken("x"), pendingBody);
        Assert.DoesNotContain("idToken", pendingBody, StringComparison.OrdinalIgnoreCase);

        var onboardingToken = JsonDocument.Parse(pendingBody).RootElement.GetProperty("onboardingToken").GetString()!;
        var complete = await client.PostAsync(
            "api/auth/google/onboarding",
            JsonContent.Create(OnboardingBody(onboardingToken, "MySecurePass1")));
        var completeBody = await complete.Content.ReadAsStringAsync();
        Assert.DoesNotContain("MySecurePass1", completeBody);
        Assert.DoesNotContain("suggestedPassword", completeBody);

        while (factory.Logs.TryDequeue(out var logLine))
        {
            Assert.DoesNotContain(onboardingToken, logLine);
            Assert.DoesNotContain("MySecurePass1", logLine);
        }
    }
}
