using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>BR-103/104 — quên (link email)/đặt lại/đổi mật khẩu và vô hiệu token cũ bằng security stamp.</summary>
[Collection(nameof(SportHubApiCollection))]
public class PasswordResetTests(SportHubApiFactory factory)
{
    private const string OldPassword = "OldPassword-1!";
    private const string NewPassword = "Brand-New-Pass-2?";

    private static int _ipCounter = 100;

    /// <summary>Mỗi lời gọi một IP riêng để không đụng rate limit auth-password-reset (3/phút/IP).</summary>
    private HttpClient Client()
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(
            SportHubApiFactory.ClientIpHeader, $"10.60.{Interlocked.Increment(ref _ipCounter) / 250}.{_ipCounter % 250}");
        return client;
    }

    private static string NewEmail() => $"reset-{Guid.NewGuid():N}@example.com";

    // Host test ký/validate JWT bằng khóa lấy từ cấu hình lúc đăng ký service, còn AuthService dùng IOptions
    // (có thể khác khóa trong môi trường test), nên token do API cấp chỉ được kiểm qua claim sst, còn việc
    // middleware chấp nhận token dùng factory.IssueToken (cùng khóa validate).
    private static Guid StampClaim(string token)
        => Guid.Parse(new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(token)
            .Claims.Single(c => c.Type == "sst").Value);

    private async Task<Guid> StampInDb(Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        return await db.UserAccounts.Where(u => u.UserId == userId).Select(u => u.SecurityStamp).SingleAsync();
    }

    private Task<HttpResponseMessage> Forgot(string email)
        => Client().PostAsync("api/auth/password/forgot", JsonContent.Create(new { email }));

    private Task<HttpResponseMessage> Reset(string email, string otp, string password = NewPassword, string? confirm = null)
        => Client().PostAsync("api/auth/password/reset", JsonContent.Create(new
        {
            email, token = otp, newPassword = password, confirmNewPassword = confirm ?? password
        }));

    private async Task<HttpResponseMessage> Protected(string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "api/__tests/protected");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await Client().SendAsync(request);
    }

    private async Task<string> LoginToken(string email, string password)
    {
        var response = await Client().PostAsync("api/auth/login", JsonContent.Create(new { email, password }));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.GetProperty("accessToken").GetString()!;
    }

    private static async Task<string> ErrorOf(HttpResponseMessage r)
        => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.GetProperty("error").GetString()!;

    [Fact]
    public async Task Account_profile_refresh_returns_authoritative_role_specialties_and_approval()
    {
        var coach = await factory.SeedUserAsync(NewEmail(), OldPassword, role: UserRole.ExternalCoach);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var sport = new SportHub.Scheduling.Catalog.Domain.Sport
            {
                Name = $"Profile test {Guid.NewGuid():N}",
                OperationType = SportHub.Scheduling.Catalog.Domain.SportOperationType.WalkIn
            };
            db.Sports.Add(sport);
            await db.SaveChangesAsync();
            var sportId = sport.SportId;
            db.Set<SportHub.Identity.Domain.Entities.UserSportSpecialty>().Add(new() { UserId = coach.UserId, SportId = sportId });
            db.Set<SportHub.Identity.Domain.Entities.ExternalCoachProfile>().Add(new()
            {
                UserId = coach.UserId, ApprovalStatus = ExternalCoachApprovalStatus.PendingApproval, CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(coach.UserId, UserRole.ExternalCoach));
        var first = await client.GetAsync("api/users/me");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var body = JsonDocument.Parse(await first.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("EXTERNAL_COACH", body.GetProperty("role").GetString());
        Assert.Equal("PENDING_APPROVAL", body.GetProperty("approvalStatus").GetString());
        Assert.Single(body.GetProperty("sportIds").EnumerateArray());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var profile = await db.Set<SportHub.Identity.Domain.Entities.ExternalCoachProfile>().SingleAsync(p => p.UserId == coach.UserId);
            profile.ApprovalStatus = ExternalCoachApprovalStatus.Suspended;
            await db.SaveChangesAsync();
        }
        var refreshed = await client.GetAsync("api/users/me");
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        Assert.Equal("SUSPENDED", JsonDocument.Parse(await refreshed.Content.ReadAsStringAsync()).RootElement.GetProperty("approvalStatus").GetString());
    }

    [Fact]
    public async Task Forgot_is_neutral_for_unknown_locked_and_existing_emails_and_sends_a_link_only_to_active_ones()
    {
        var existing = NewEmail();
        var banned = NewEmail();
        var unknown = NewEmail();
        await factory.SeedUserAsync(existing, OldPassword);
        await factory.SeedUserAsync(banned, OldPassword, status: UserStatus.Banned);

        foreach (var email in new[] { existing, banned, unknown })
        {
            Assert.Equal(HttpStatusCode.NoContent, (await Forgot(email)).StatusCode);
        }

        Assert.Equal(1, factory.Emails.CountFor(existing));
        Assert.Equal(0, factory.Emails.CountFor(banned));
        Assert.Equal(0, factory.Emails.CountFor(unknown));
        var body = factory.Emails.Sent.Last(m => m.To == existing).Body;
        Assert.Contains("/reset-password?email=", body);
        Assert.Contains("ĐẶT LẠI MẬT KHẨU", body);
    }

    [Fact]
    public async Task Forgot_twice_within_the_cooldown_stays_neutral_and_sends_only_one_email()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, OldPassword);

        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(email)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(email)).StatusCode);

        Assert.Equal(1, factory.Emails.CountFor(email));
    }

    [Fact]
    public async Task Reset_sets_new_password_without_asking_for_the_old_one_and_invalidates_old_tokens()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, OldPassword);
        var oldToken = factory.IssueToken(user.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.OK, (await Protected(oldToken)).StatusCode);

        await Forgot(email);
        var otp = factory.Emails.LatestResetTokenFor(email);

        var reset = await Reset(email, otp);
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Protected(oldToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PostAsync("api/auth/login", JsonContent.Create(new { email, password = OldPassword }))).StatusCode);

        var newToken = await LoginToken(email, NewPassword);
        Assert.Equal(await StampInDb(user.UserId), StampClaim(newToken));
        // Token cấp lại theo stamp mới được middleware chấp nhận (ký bằng khóa mà host test thực sự validate).
        Assert.Equal(HttpStatusCode.OK, (await Protected(factory.IssueToken(user.UserId, UserRole.Member))).StatusCode);
    }

    [Fact]
    public async Task Reset_link_is_single_use_and_two_concurrent_requests_yield_exactly_one_success()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, OldPassword);
        await Forgot(email);
        var otp = factory.Emails.LatestResetTokenFor(email);

        var results = await Task.WhenAll(
            Reset(email, otp, "Racer-Pass-One-1!"),
            Reset(email, otp, "Racer-Pass-Two-2!"),
            Reset(email, otp, "Racer-Pass-Three-3!"));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.NoContent));
        Assert.All(results.Where(r => r.StatusCode != HttpStatusCode.NoContent),
            r => Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode));

        Assert.Equal("otp_already_used", await ErrorOf(await Reset(email, otp)));
    }

    [Fact]
    public async Task Five_wrong_tokens_lock_the_link_even_for_the_correct_token()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, OldPassword);
        await Forgot(email);
        var otp = factory.Emails.LatestResetTokenFor(email);
        var wrong = "wrong-token-value";

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal("otp_invalid", await ErrorOf(await Reset(email, wrong)));
        }

        // Bộ đếm sai phải được commit (không rollback theo request lỗi).
        Assert.Equal("otp_attempts_exceeded", await ErrorOf(await Reset(email, otp)));
    }

    [Fact]
    public async Task Reset_rejects_weak_password_and_mismatched_confirmation_without_burning_the_otp()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, OldPassword);
        await Forgot(email);
        var otp = factory.Emails.LatestResetTokenFor(email);

        Assert.Equal("password_too_short", await ErrorOf(await Reset(email, otp, "Ab1!")));
        Assert.Equal("password_contains_email", await ErrorOf(await Reset(email, otp, email.Split('@')[0] + "A1!")));
        Assert.Equal("password_confirmation_mismatch", await ErrorOf(await Reset(email, otp, NewPassword, "Different-Pass-3!")));

        Assert.Equal(HttpStatusCode.NoContent, (await Reset(email, otp)).StatusCode);
    }

    [Fact]
    public async Task Reset_without_a_requested_link_is_a_generic_invalid_token()
    {
        var response = await Reset(NewEmail(), "never-issued-token");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("otp_invalid", await ErrorOf(response));
    }

    [Fact]
    public async Task Google_only_account_can_set_a_password_through_reset()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, password: null);
        await Forgot(email);

        Assert.Equal(HttpStatusCode.NoContent, (await Reset(email, factory.Emails.LatestResetTokenFor(email))).StatusCode);
        await LoginToken(email, NewPassword);
    }

    [Fact]
    public async Task Change_password_requires_current_password_and_returns_a_fresh_token()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, OldPassword);
        var oldToken = factory.IssueToken(user.UserId, UserRole.Member);

        HttpRequestMessage Change(string? current, string next, string confirm)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "api/users/me/password")
            {
                Content = JsonContent.Create(new { currentPassword = current, newPassword = next, confirmNewPassword = confirm })
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", oldToken);
            return request;
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await Client().SendAsync(Change(null, NewPassword, NewPassword))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().SendAsync(Change("Wrong-Current-1!", NewPassword, NewPassword))).StatusCode);

        var same = await Client().SendAsync(Change(OldPassword, OldPassword, OldPassword));
        Assert.Equal("new_password_same_as_current", await ErrorOf(same));

        var ok = await Client().SendAsync(Change(OldPassword, NewPassword, NewPassword));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var freshToken = JsonDocument.Parse(await ok.Content.ReadAsStringAsync()).RootElement.GetProperty("accessToken").GetString()!;

        Assert.Equal(HttpStatusCode.Unauthorized, (await Protected(oldToken)).StatusCode);
        Assert.Equal(await StampInDb(user.UserId), StampClaim(freshToken));
        Assert.Equal(HttpStatusCode.OK, (await Protected(factory.IssueToken(user.UserId, UserRole.Member))).StatusCode);
    }

    [Fact]
    public async Task Login_with_legacy_bcrypt_hash_rehashes_to_v2()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, password: null);
        await factory.AddEmptyCredentialAsync(user.UserId, BCrypt.Net.BCrypt.HashPassword(OldPassword));

        await LoginToken(email, OldPassword);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var hash = (await db.UserCredentials.SingleAsync(c => c.UserId == user.UserId)).PasswordHash!;

        Assert.StartsWith("v2$", hash);
        await LoginToken(email, OldPassword);
    }

    [Fact]
    public async Task Token_without_security_stamp_or_with_stale_role_is_rejected()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, OldPassword);

        var noStamp = SportHub.BuildingBlocks.Infrastructure.Authentication.JwtService.GenerateAccessToken(
            user.UserId, nameof(UserRole.Member), factory.EffectiveJwtOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Protected(noStamp)).StatusCode);

        var wrongRole = SportHub.BuildingBlocks.Infrastructure.Authentication.JwtService.GenerateAccessToken(
            user.UserId, nameof(UserRole.CenterManager), factory.EffectiveJwtOptions, user.SecurityStamp);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Protected(wrongRole)).StatusCode);
    }
}
