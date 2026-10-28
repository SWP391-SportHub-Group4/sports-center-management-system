using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.Identity.Infrastructure.Email;

namespace SportHub.Security.Tests.Unit;

public sealed class BrevoEmailSenderTests
{
    private static BrevoEmailOptions Settings() => new()
    {
        ApiKey = "test-only-api-key",
        FromAddress = "sender@example.com",
        FromName = "SportHub"
    };

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Https_payload_preserves_recipient_html_and_optional_attachments(bool attach)
    {
        var calls = 0;
        using var client = new HttpClient(new StubHandler(async request =>
        {
            calls++;
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("https://api.brevo.com/v3/smtp/email", request.RequestUri!.AbsoluteUri);
            Assert.Equal("test-only-api-key", request.Headers.GetValues("api-key").Single());
            var body = await request.Content!.ReadAsStringAsync();
            Assert.DoesNotContain("test-only-api-key", body);
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            Assert.Equal("sender@example.com", root.GetProperty("sender").GetProperty("email").GetString());
            Assert.Equal("SportHub", root.GetProperty("sender").GetProperty("name").GetString());
            Assert.Equal("staff@example.com", root.GetProperty("to")[0].GetProperty("email").GetString());
            Assert.Equal("Activate your account", root.GetProperty("subject").GetString());
            Assert.Equal("<p>Activation link</p>", root.GetProperty("htmlContent").GetString());
            Assert.Equal(attach, root.TryGetProperty("attachment", out var files));
            if (attach)
            {
                Assert.Equal("invoice.pdf", files[0].GetProperty("name").GetString());
                Assert.Equal(new byte[] { 1, 2, 3 }, Convert.FromBase64String(files[0].GetProperty("content").GetString()!));
            }
            return Reply(HttpStatusCode.Created, "{\"messageId\":\"<delivery-id>\"}");
        }));
        var sender = new BrevoEmailSender(client, Options.Create(Settings()));
        if (attach)
            await sender.SendAsync("staff@example.com", "Activate your account", "<p>Activation link</p>",
                [new EmailAttachment("invoice.pdf", "application/pdf", [1, 2, 3])]);
        else
            await sender.SendAsync("staff@example.com", "Activate your account", "<p>Activation link</p>");
        Assert.Equal(1, calls);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task Rejected_delivery_throws_without_echoing_provider_payload(HttpStatusCode status)
    {
        using var client = new HttpClient(new StubHandler(_ => Task.FromResult(
            Reply(status, "{\"message\":\"test-only-api-key secret-activation-token\"}"))));
        var sender = new BrevoEmailSender(client, Options.Create(Settings()));
        var error = await Assert.ThrowsAsync<HttpRequestException>(() => sender.SendAsync("staff@example.com", "Invitation", "Body"));
        Assert.Equal(status, error.StatusCode);
        Assert.DoesNotContain("test-only-api-key", error.ToString());
        Assert.DoesNotContain("secret-activation-token", error.ToString());
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"messageId\":\"\"}")]
    [InlineData("not-json")]
    public async Task Success_without_delivery_acknowledgement_is_not_reported_as_sent(string body)
    {
        using var client = new HttpClient(new StubHandler(_ => Task.FromResult(Reply(HttpStatusCode.Created, body))));
        var sender = new BrevoEmailSender(client, Options.Create(Settings()));
        await Assert.ThrowsAsync<InvalidOperationException>(() => sender.SendAsync("staff@example.com", "Invitation", "Body"));
    }

    [Fact]
    public void Brevo_can_start_in_production_without_smtp()
    {
        var configuration = Configuration(new()
        {
            ["Email:Provider"] = "Brevo",
            ["Email:Brevo:ApiKey"] = "test-only-api-key",
            ["Email:Brevo:FromAddress"] = "sender@example.com"
        });
        var services = new ServiceCollection().AddSportHubEmail(configuration, isDevelopment: false);
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        Assert.IsType<BrevoEmailSender>(scope.ServiceProvider.GetRequiredService<IEmailSender>());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("Email:Smtp:")]
    [InlineData("Smtp:")]
    public void Smtp_defaults_and_legacy_sections_remain_supported(string? prefix)
    {
        var values = new Dictionary<string, string?>();
        if (prefix != null)
        {
            values[prefix + "Host"] = "smtp.example.com";
            values[prefix + "FromAddress"] = "sender@example.com";
        }
        var services = new ServiceCollection().AddSportHubEmail(Configuration(values), isDevelopment: prefix == null);
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        if (prefix == null) Assert.IsType<UnavailableEmailSender>(sender);
        else Assert.IsType<SmtpEmailSender>(sender);
    }

    [Theory]
    [InlineData("Brevo", "", "sender@example.com")]
    [InlineData("Brevo", "test-only-api-key", "")]
    [InlineData("Brevo", "test-only-api-key", "invalid-address")]
    [InlineData("Unknown", "", "")]
    [InlineData("Smtp", "", "")]
    public void Invalid_production_configuration_stops_startup(string selected, string key, string from)
    {
        var configuration = Configuration(new()
        {
            ["Email:Provider"] = selected,
            ["Email:Brevo:ApiKey"] = key,
            ["Email:Brevo:FromAddress"] = from
        });
        Assert.Throws<InvalidOperationException>(() => new ServiceCollection().AddSportHubEmail(configuration, isDevelopment: false));
    }

    private static IConfiguration Configuration(Dictionary<string, string?> values)
        => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static HttpResponseMessage Reply(HttpStatusCode status, string body)
        => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => handler(request);
    }
}
