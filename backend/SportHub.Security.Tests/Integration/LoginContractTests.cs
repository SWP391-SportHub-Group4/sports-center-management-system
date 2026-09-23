using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Hop dong HTTP cua login tren PostgreSQL that (citext), va regression cho register.
/// Moi test dung IP rieng de khong dinh quota 10/phut cua test khac.
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public class LoginContractTests(SportHubApiFactory factory)
{
    private const string ValidPassword = "CorrectHorse1";

    private HttpClient ClientFor(string ip)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, ip);
        return client;
    }

    private static HttpContent Body(string email, string password)
        => JsonContent.Create(new { email, password });

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task Successful_login_returns_200_with_real_profile_full_name()
    {
        var email = $"ok-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(email, ValidPassword, fullName: "Tran Thi B");

        var response = await ClientFor("10.20.0.1").PostAsync("api/auth/login", Body(email, ValidPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await JsonOf(response);
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("accessToken").GetString()));
        Assert.Equal("Tran Thi B", json.GetProperty("user").GetProperty("fullName").GetString());
        Assert.Equal(nameof(UserRole.Member), json.GetProperty("user").GetProperty("role").GetString());
    }

    [Fact]
    public async Task Email_is_matched_case_insensitively_by_citext()
    {
        var email = $"case-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(email, ValidPassword);

        var response = await ClientFor("10.20.0.2")
            .PostAsync("api/auth/login", Body(email.ToUpperInvariant(), ValidPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Email_with_surrounding_whitespace_still_finds_the_account()
    {
        var email = $"pad-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(email, ValidPassword);

        var response = await ClientFor("10.20.0.3")
            .PostAsync("api/auth/login", Body($"  {email}  ", ValidPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task All_three_failure_branches_return_the_same_401_body()
    {
        var client = ClientFor("10.20.0.4");

        // 1) email khong ton tai
        var missing = await client.PostAsync("api/auth/login",
            Body($"none-{Guid.NewGuid():N}@example.com", ValidPassword));

        // 2) tai khoan khong co row UserCredential nao
        var noCredentialEmail = $"nocred-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(noCredentialEmail, password: null);
        var noCredential = await client.PostAsync("api/auth/login", Body(noCredentialEmail, ValidPassword));

        // 3) co row UserCredential nhung password_hash NULL
        var nullHashEmail = $"nullhash-{Guid.NewGuid():N}@example.com";
        var nullHashUser = await factory.SeedUserAsync(nullHashEmail, password: null);
        await factory.AddEmptyCredentialAsync(nullHashUser.UserId, passwordHash: null);
        var nullHash = await client.PostAsync("api/auth/login", Body(nullHashEmail, ValidPassword));

        // 4) sai password
        var wrongPasswordEmail = $"wrong-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(wrongPasswordEmail, ValidPassword);
        var wrongPassword = await client.PostAsync("api/auth/login", Body(wrongPasswordEmail, "NotThePassword1"));

        HttpResponseMessage[] responses = [missing, noCredential, nullHash, wrongPassword];
        var bodies = new List<string>();

        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();

            // BR-60 van duoc ton trong (khong the login bang password), nhung khong con
            // lo ra ma loi rieng cho biet tai khoan chua dat password.
            Assert.DoesNotContain("password_not_set", body);
            bodies.Add(body);
        }

        Assert.Single(bodies.Distinct());
        Assert.Contains("invalid_credentials", bodies[0]);
    }

    [Theory]
    [InlineData(UserStatus.Banned, "account_banned")]
    [InlineData(UserStatus.Deactivated, "account_deactivated")]
    public async Task Blocked_account_with_correct_password_returns_403(UserStatus status, string errorCode)
    {
        var email = $"blk-{Guid.NewGuid():N}@example.com";
        var user = await factory.SeedUserAsync(email, ValidPassword);
        await factory.SetStatusAsync(user.UserId, status);

        var response = await ClientFor($"10.20.1.{(int)status}")
            .PostAsync("api/auth/login", Body(email, ValidPassword));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains(errorCode, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Blocked_account_with_wrong_password_returns_401_not_403()
    {
        var email = $"blkwrong-{Guid.NewGuid():N}@example.com";
        var user = await factory.SeedUserAsync(email, ValidPassword);
        await factory.SetStatusAsync(user.UserId, UserStatus.Banned);

        var response = await ClientFor("10.20.0.5")
            .PostAsync("api/auth/login", Body(email, "NotThePassword1"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("", ValidPassword)]
    [InlineData("not-an-email", ValidPassword)]
    [InlineData("valid@example.com", "")]
    public async Task Invalid_dto_returns_400(string email, string password)
    {
        var response = await ClientFor($"10.20.2.{email.Length + password.Length}")
            .PostAsync("api/auth/login", Body(email, password));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Password_longer_than_72_bytes_returns_400_not_500()
    {
        var tooLong = new string('a', 73);
        Assert.Equal(73, Encoding.UTF8.GetByteCount(tooLong));

        var response = await ClientFor("10.20.0.6")
            .PostAsync("api/auth/login", Body("valid@example.com", tooLong));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // --- Regression: Register khong duoc doi hanh vi ---

    [Fact]
    public async Task Register_still_returns_201_and_409_on_duplicate_email()
    {
        var client = ClientFor("10.20.0.7");
        var email = $"reg-{Guid.NewGuid():N}@example.com";

        var created = await client.PostAsync("api/auth/register",
            JsonContent.Create(new { email, password = ValidPassword, fullName = "Le Van C" }));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var duplicate = await client.PostAsync("api/auth/register",
            JsonContent.Create(new { email, password = ValidPassword, fullName = "Le Van C" }));

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains("email_already_exists", await duplicate.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Account_registered_through_the_api_can_immediately_log_in()
    {
        var client = ClientFor("10.20.0.8");
        var email = $"round-{Guid.NewGuid():N}@example.com";

        await client.PostAsync("api/auth/register",
            JsonContent.Create(new { email, password = ValidPassword, fullName = "Pham Thi D" }));

        var login = await client.PostAsync("api/auth/login", Body(email, ValidPassword));

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var json = await JsonOf(login);
        Assert.Equal("Pham Thi D", json.GetProperty("user").GetProperty("fullName").GetString());
    }

    // --- BR-5/BR-38: khong lo secret ra response hay log ---

    [Fact]
    public async Task No_response_or_log_leaks_password_hash_or_token()
    {
        var email = $"leak-{Guid.NewGuid():N}@example.com";
        const string distinctivePassword = "Zq7-distinctive-password-value";
        await factory.SeedUserAsync(email, distinctivePassword);

        factory.Logs.Clear();
        var client = ClientFor("10.20.0.9");

        var ok = await client.PostAsync("api/auth/login", Body(email, distinctivePassword));
        var bad = await client.PostAsync("api/auth/login", Body(email, "wrong-" + distinctivePassword));

        var okBody = await ok.Content.ReadAsStringAsync();
        var badBody = await bad.Content.ReadAsStringAsync();

        var accessToken = JsonDocument.Parse(okBody).RootElement.GetProperty("accessToken").GetString()!;

        Assert.DoesNotContain(distinctivePassword, okBody);
        Assert.DoesNotContain(distinctivePassword, badBody);
        Assert.DoesNotContain("passwordHash", okBody);
        Assert.DoesNotContain("$2a$", okBody);

        var logs = factory.Logs.ToArray();
        Assert.DoesNotContain(logs, line => line.Contains(distinctivePassword, StringComparison.Ordinal));
        Assert.DoesNotContain(logs, line => line.Contains("$2a$", StringComparison.Ordinal));
        Assert.DoesNotContain(logs, line => line.Contains(accessToken, StringComparison.Ordinal));
    }
}
