using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>Google Login — mat khau goi y cho tai khoan moi, khong vi pham BR-59/BR-60.</summary>
[Collection(nameof(SportHubApiCollection))]
public class GoogleLoginTests(SportHubApiFactory factory)
{
    private HttpClient ClientFor(string ip)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, ip);
        return client;
    }

    private static HttpContent GoogleBody(string subject, string email)
        => JsonContent.Create(new { idToken = FakeGoogleTokenVerifier.Token(subject, email, "Google User") });

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task New_google_account_gets_suggestion_but_password_hash_stays_null_until_set_password()
    {
        var client = ClientFor("10.40.0.1");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        var response = await client.PostAsync("api/auth/google", GoogleBody(subject, email));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await JsonOf(response);
        Assert.True(json.GetProperty("isNewAccount").GetBoolean());
        var suggested = json.GetProperty("suggestedPassword").GetString()!;
        Assert.Equal(14, suggested.Length);

        // BR-60: goi y KHONG duoc ghi vao credential.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var user = await db.UserAccounts.Include(u => u.Credential).SingleAsync(u => u.Email == email);
            Assert.Null(user.Credential?.PasswordHash);
        }

        var loginBefore = await client.PostAsync("api/auth/login", JsonContent.Create(new { email, password = suggested }));
        Assert.Equal(HttpStatusCode.Unauthorized, loginBefore.StatusCode);

        // Nguoi dung chu dong dat mat khau (dung chinh chuoi goi y) tu phien da xac thuc.
        var setPassword = new HttpRequestMessage(HttpMethod.Post, "api/users/me/password")
        {
            Content = JsonContent.Create(new { newPassword = suggested })
        };
        // Ky token bang EffectiveJwtOptions nhu cac test khac (xem ghi chu o SportHubApiFactory).
        var userId = json.GetProperty("user").GetProperty("userId").GetGuid();
        setPassword.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", factory.IssueToken(userId, UserRole.Member));
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(setPassword)).StatusCode);

        var loginAfter = await client.PostAsync("api/auth/login", JsonContent.Create(new { email, password = suggested }));
        Assert.Equal(HttpStatusCode.OK, loginAfter.StatusCode);
        Assert.False((await JsonOf(loginAfter)).GetProperty("isNewAccount").GetBoolean());
    }

    [Fact]
    public async Task Returning_google_user_gets_no_suggestion()
    {
        var client = ClientFor("10.40.0.2");
        var subject = Guid.NewGuid().ToString("N");
        var email = $"g-{subject}@example.com";

        await client.PostAsync("api/auth/google", GoogleBody(subject, email));
        var again = await client.PostAsync("api/auth/google", GoogleBody(subject, email));

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var json = await JsonOf(again);
        Assert.False(json.GetProperty("isNewAccount").GetBoolean());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("suggestedPassword").ValueKind);
    }

    [Fact]
    public async Task Existing_unlinked_email_is_still_409_and_not_linked()
    {
        var email = $"g-existing-{Guid.NewGuid():N}@example.com";
        var user = await factory.SeedUserAsync(email, "CorrectHorse1");

        var response = await ClientFor("10.40.0.3")
            .PostAsync("api/auth/google", GoogleBody(Guid.NewGuid().ToString("N"), email));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("google_account_not_linked", body);
        Assert.DoesNotContain("suggestedPassword", body);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.UserExternalLogins.AnyAsync(l => l.UserId == user.UserId));
        Assert.Equal(1, await db.UserAccounts.CountAsync(u => u.Email == email));
    }
}
