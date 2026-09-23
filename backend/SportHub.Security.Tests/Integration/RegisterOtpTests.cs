using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Security.Tests.Integration;

/// <summary>BR-78 — Register bang email/mat khau bat buoc xac thuc OTP. Moi test dung IP rieng.</summary>
[Collection(nameof(SportHubApiCollection))]
public class RegisterOtpTests(SportHubApiFactory factory)
{
    private const string ValidPassword = "CorrectHorse1";

    private HttpClient ClientFor(string ip)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, ip);
        return client;
    }

    private static string NewEmail() => $"otp-{Guid.NewGuid():N}@example.com";

    private static HttpContent RegisterBody(string email, string otpCode)
        => JsonContent.Create(new { email, password = ValidPassword, fullName = "Vo Van E", otpCode });

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static async Task AssertError(HttpResponseMessage response, HttpStatusCode status, string error)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(error, (await JsonOf(response)).GetProperty("error").GetString());
    }

    private async Task UpdateOtpAsync(string email, Action<EmailOtp> change)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var otp = await db.EmailOtps.SingleAsync(o => o.Email == email);
        change(otp);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Otp_then_register_creates_account_flagged_as_new_and_code_is_stored_hashed()
    {
        var client = ClientFor("10.30.0.1");
        var email = NewEmail();

        var code = await factory.RequestRegisterOtpAsync(client, email);
        Assert.Matches(@"^\d{6}$", code);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var otp = await db.EmailOtps.SingleAsync(o => o.Email == email);
            Assert.NotEqual(code, otp.CodeHash);
            Assert.Equal(64, otp.CodeHash.Length);

            // Buoc 1 chua tao tai khoan nao.
            Assert.False(await db.UserAccounts.AnyAsync(u => u.Email == email));
        }

        var response = await client.PostAsync("api/auth/register", RegisterBody(email, code));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await JsonOf(response);
        Assert.True(json.GetProperty("isNewAccount").GetBoolean());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("suggestedPassword").ValueKind);

        var login = await client.PostAsync("api/auth/login", JsonContent.Create(new { email, password = ValidPassword }));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.False((await JsonOf(login)).GetProperty("isNewAccount").GetBoolean());
    }

    [Fact]
    public async Task Register_without_otp_code_is_rejected_by_validation()
    {
        var response = await ClientFor("10.30.0.2").PostAsync("api/auth/register",
            JsonContent.Create(new { email = NewEmail(), password = ValidPassword, fullName = "Vo Van E" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_without_requesting_otp_first_returns_otp_not_found()
    {
        var response = await ClientFor("10.30.0.3").PostAsync("api/auth/register", RegisterBody(NewEmail(), "123456"));

        await AssertError(response, HttpStatusCode.BadRequest, "otp_not_found");
    }

    [Fact]
    public async Task Used_code_reports_otp_already_used_before_anything_else()
    {
        var client = ClientFor("10.30.0.4");
        var email = NewEmail();
        var code = await factory.RequestRegisterOtpAsync(client, email);

        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsync("api/auth/register", RegisterBody(email, code))).StatusCode);

        // Ca khi da qua han: "da dung" phai thang "het han" va "email da ton tai".
        await UpdateOtpAsync(email, o => o.ExpiresAt = DateTime.UtcNow.AddMinutes(-1));

        await AssertError(
            await client.PostAsync("api/auth/register", RegisterBody(email, code)),
            HttpStatusCode.BadRequest,
            "otp_already_used");
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var client = ClientFor("10.30.0.5");
        var email = NewEmail();
        var code = await factory.RequestRegisterOtpAsync(client, email);

        await UpdateOtpAsync(email, o => o.ExpiresAt = DateTime.UtcNow.AddSeconds(-1));

        await AssertError(
            await client.PostAsync("api/auth/register", RegisterBody(email, code)),
            HttpStatusCode.BadRequest,
            "otp_expired");
    }

    [Fact]
    public async Task Five_wrong_codes_lock_the_code_even_for_the_right_one()
    {
        // auth-register chi cho 5 request/phut/IP — lan thu 6 di tu IP khac.
        var first = ClientFor("10.30.0.6");
        var email = NewEmail();
        var code = await factory.RequestRegisterOtpAsync(first, email);
        var wrong = code == "000000" ? "111111" : "000000";

        for (var i = 0; i < 5; i++)
        {
            await AssertError(
                await first.PostAsync("api/auth/register", RegisterBody(email, wrong)),
                HttpStatusCode.BadRequest,
                "otp_invalid");
        }

        await AssertError(
            await ClientFor("10.30.0.7").PostAsync("api/auth/register", RegisterBody(email, code)),
            HttpStatusCode.BadRequest,
            "otp_attempts_exceeded");
    }

    [Fact]
    public async Task Resend_within_cooldown_is_rejected_and_sends_no_second_email()
    {
        var client = ClientFor("10.30.0.8");
        var email = NewEmail();
        await factory.RequestRegisterOtpAsync(client, email);

        var again = await client.PostAsync("api/auth/register/otp", JsonContent.Create(new { email }));

        await AssertError(again, HttpStatusCode.TooManyRequests, "otp_resend_too_soon");
        Assert.Equal(1, factory.Emails.CountFor(email));
    }

    [Fact]
    public async Task Resend_after_cooldown_replaces_the_old_code()
    {
        var client = ClientFor("10.30.0.9");
        var email = NewEmail();
        var oldCode = await factory.RequestRegisterOtpAsync(client, email);

        await UpdateOtpAsync(email, o => o.CreatedAt = DateTime.UtcNow.AddMinutes(-2));
        var newCode = await factory.RequestRegisterOtpAsync(client, email);

        // Hai ma trung nhau xac suat 1/10^6 — khi do bo qua buoc kiem ma cu.
        if (oldCode != newCode)
        {
            await AssertError(
                await client.PostAsync("api/auth/register", RegisterBody(email, oldCode)),
                HttpStatusCode.BadRequest,
                "otp_invalid");
        }

        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsync("api/auth/register", RegisterBody(email, newCode))).StatusCode);
    }

    [Fact]
    public async Task Otp_for_existing_email_returns_409_and_sends_nothing()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, ValidPassword);

        var response = await ClientFor("10.30.0.10")
            .PostAsync("api/auth/register/otp", JsonContent.Create(new { email }));

        await AssertError(response, HttpStatusCode.Conflict, "email_already_exists");
        Assert.Equal(0, factory.Emails.CountFor(email));
    }

    [Fact]
    public async Task Account_created_elsewhere_after_otp_gets_email_already_exists_and_code_stays_unused()
    {
        var client = ClientFor("10.30.0.11");
        var email = NewEmail();
        var code = await factory.RequestRegisterOtpAsync(client, email);

        await factory.SeedUserAsync(email, ValidPassword);

        await AssertError(
            await client.PostAsync("api/auth/register", RegisterBody(email, code)),
            HttpStatusCode.Conflict,
            "email_already_exists");

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Null((await db.EmailOtps.SingleAsync(o => o.Email == email)).ConsumedAt);
    }

    [Fact]
    public async Task Otp_email_is_matched_case_insensitively()
    {
        var client = ClientFor("10.30.0.12");
        var email = NewEmail();
        var code = await factory.RequestRegisterOtpAsync(client, email.ToUpperInvariant());

        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsync("api/auth/register", RegisterBody(email, code))).StatusCode);
    }

    [Fact]
    public async Task Otp_endpoint_allows_three_requests_per_minute_per_ip()
    {
        var client = ClientFor("10.30.0.13");

        for (var i = 0; i < 3; i++)
        {
            var ok = await client.PostAsync("api/auth/register/otp", JsonContent.Create(new { email = NewEmail() }));
            Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        }

        var fourth = await client.PostAsync("api/auth/register/otp", JsonContent.Create(new { email = NewEmail() }));
        Assert.Equal(HttpStatusCode.TooManyRequests, fourth.StatusCode);
    }
}
