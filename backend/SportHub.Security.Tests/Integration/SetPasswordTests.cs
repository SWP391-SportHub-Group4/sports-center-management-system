using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Luồng A (docs/SportManagement_BusinessRules_v2.0_updated.docx, mục P): tài khoản chưa có mật khẩu (đăng ký bằng Google) tạo mật khẩu trong Cài đặt
/// tài khoản, bắt buộc kèm mã OTP 6 số gửi về chính email đó. Tài khoản đã có mật khẩu vẫn đổi bằng mật khẩu hiện tại.
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public class SetPasswordTests(SportHubApiFactory factory)
{
    private const string NewPassword = "Brand-New-Pass-2?";

    private static int _ipCounter = 100;

    private HttpClient Client(string token)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(
            SportHubApiFactory.ClientIpHeader, $"10.70.{Interlocked.Increment(ref _ipCounter) / 250}.{_ipCounter % 250}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static string NewEmail() => $"setpw-{Guid.NewGuid():N}@example.com";

    private async Task<(string Email, Guid UserId, string Token)> GoogleOnlyAsync()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, password: null);
        return (email, user.UserId, factory.IssueToken(user.UserId, UserRole.Member));
    }

    private static HttpRequestMessage SetPassword(string? otp, string password = NewPassword, string? confirm = null)
        => new(HttpMethod.Post, "api/users/me/password")
        {
            Content = JsonContent.Create(new
            {
                otpCode = otp,
                newPassword = password,
                confirmNewPassword = confirm ?? password
            })
        };

    private static async Task<string> ErrorOf(HttpResponseMessage r)
        => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.GetProperty("error").GetString()!;

    [Fact]
    public async Task Google_only_account_cannot_set_a_password_without_the_email_code()
    {
        var (_, _, token) = await GoogleOnlyAsync();

        var response = await Client(token).SendAsync(SetPassword(otp: null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("otp_required", await ErrorOf(response));
    }

    [Fact]
    public async Task Code_is_emailed_to_the_account_owner_and_creates_the_password_once()
    {
        var (email, userId, token) = await GoogleOnlyAsync();
        var client = Client(token);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("api/users/me/password/otp", null)).StatusCode);
        Assert.Equal(1, factory.Emails.CountFor(email));
        var code = factory.Emails.LatestOtpFor(email);
        Assert.Matches("^[0-9]{6}$", code);

        var wrong = await client.SendAsync(SetPassword("000000" == code ? "111111" : "000000"));
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal("otp_invalid", await ErrorOf(wrong));

        var ok = await client.SendAsync(SetPassword(code));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.True(JsonDocument.Parse(await ok.Content.ReadAsStringAsync()).RootElement.GetProperty("accessToken").GetString()!.Length > 20);

        // Có thể đăng nhập bằng email + mật khẩu vừa tạo.
        var login = await factory.CreateApiClient().PostAsync(
            "api/auth/login", JsonContent.Create(new { email, password = NewPassword }));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        // Mã dùng một lần, và phiên cũ bị vô hiệu bằng security stamp.
        var reuse = await Client(factory.IssueToken(userId, UserRole.Member)).SendAsync(SetPassword(code));
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
    }

    [Fact]
    public async Task Weak_password_or_mismatched_confirmation_does_not_burn_the_code()
    {
        var (email, _, token) = await GoogleOnlyAsync();
        var client = Client(token);
        await client.PostAsync("api/users/me/password/otp", null);
        var code = factory.Emails.LatestOtpFor(email);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(SetPassword(code, confirm: "Different-Pass-3!"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(SetPassword(code, password: "123"))).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(SetPassword(code))).StatusCode);
    }

    [Fact]
    public async Task Five_wrong_codes_lock_the_code_even_for_the_correct_one()
    {
        var (email, _, token) = await GoogleOnlyAsync();
        var client = Client(token);
        await client.PostAsync("api/users/me/password/otp", null);
        var code = factory.Emails.LatestOtpFor(email);
        var wrong = code == "000000" ? "111111" : "000000";

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(SetPassword(wrong))).StatusCode);
        }

        var locked = await client.SendAsync(SetPassword(code));
        Assert.Equal(HttpStatusCode.BadRequest, locked.StatusCode);
        Assert.Equal("otp_attempts_exceeded", await ErrorOf(locked));
    }

    [Fact]
    public async Task Requesting_a_code_again_within_the_cooldown_is_rejected_without_a_second_email()
    {
        var (email, _, token) = await GoogleOnlyAsync();
        var client = Client(token);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("api/users/me/password/otp", null)).StatusCode);
        var again = await client.PostAsync("api/users/me/password/otp", null);

        Assert.Equal((HttpStatusCode)429, again.StatusCode);
        Assert.Equal("otp_resend_too_soon", await ErrorOf(again));
        Assert.Equal(1, factory.Emails.CountFor(email));
    }

    [Fact]
    public async Task Account_that_already_has_a_password_cannot_request_a_set_password_code()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, "OldPassword-1!");
        var client = Client(factory.IssueToken(user.UserId, UserRole.Member));

        var response = await client.PostAsync("api/users/me/password/otp", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("password_already_set", await ErrorOf(response));
        Assert.Equal(0, factory.Emails.CountFor(email));
    }

    [Fact]
    public async Task Code_cannot_be_requested_without_signing_in()
    {
        var response = await factory.CreateApiClient().PostAsync("api/users/me/password/otp", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_code_issued_for_one_account_does_not_work_for_another()
    {
        var (emailA, _, tokenA) = await GoogleOnlyAsync();
        var (_, _, tokenB) = await GoogleOnlyAsync();
        await Client(tokenA).PostAsync("api/users/me/password/otp", null);
        var codeOfA = factory.Emails.LatestOtpFor(emailA);

        var response = await Client(tokenB).SendAsync(SetPassword(codeOfA));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Existing_password_flow_is_unchanged_and_ignores_the_code_field()
    {
        var email = NewEmail();
        var user = await factory.SeedUserAsync(email, "OldPassword-1!");
        var client = Client(factory.IssueToken(user.UserId, UserRole.Member));

        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "api/users/me/password")
        {
            Content = JsonContent.Create(new
            {
                currentPassword = "OldPassword-1!",
                newPassword = NewPassword,
                confirmNewPassword = NewPassword
            })
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.NotNull((await db.UserCredentials.SingleAsync(c => c.UserId == user.UserId)).PasswordHash);
    }
}
