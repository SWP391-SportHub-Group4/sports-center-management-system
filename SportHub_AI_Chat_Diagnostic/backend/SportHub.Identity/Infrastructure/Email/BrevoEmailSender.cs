using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Email;

namespace SportHub.Identity.Infrastructure.Email;

/// <summary>Transactional delivery over HTTPS, including invoice/homework attachments.</summary>
public sealed class BrevoEmailSender(HttpClient client, IOptions<BrevoEmailOptions> options) : IEmailSender
{
    public Task SendAsync(string toAddress, string subject, string htmlBody, CancellationToken cancellationToken = default)
        => SendAsync(toAddress, subject, htmlBody, Array.Empty<EmailAttachment>(), cancellationToken);

    public async Task SendAsync(string toAddress, string subject, string htmlBody,
        IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        var payload = new Dictionary<string, object>
        {
            ["sender"] = new { email = settings.FromAddress, name = settings.FromName },
            ["to"] = new[] { new { email = toAddress } },
            ["subject"] = subject,
            ["htmlContent"] = htmlBody
        };
        if (attachments.Count > 0)
            payload["attachment"] = attachments.Select(file => new
            {
                name = file.FileName,
                content = Convert.ToBase64String(file.Content)
            }).ToArray();

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email");
        request.Headers.Add("api-key", settings.ApiKey);
        request.Content = JsonContent.Create(payload);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            // Never include provider response bodies: they can echo addresses, credentials or email content.
            throw new HttpRequestException($"Brevo rejected email delivery (HTTP {(int)response.StatusCode}).",
                null, response.StatusCode);

        try
        {
            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var root = document.RootElement;
            if (root.ValueKind == JsonValueKind.Object &&
                ((root.TryGetProperty("messageId", out var id) && id.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(id.GetString())) ||
                 (root.TryGetProperty("messageIds", out var ids) && ids.ValueKind == JsonValueKind.Array &&
                  ids.EnumerateArray().Any(item => item.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(item.GetString())))))
                return;
        }
        catch (JsonException)
        {
            throw new InvalidOperationException("Brevo returned an invalid email delivery acknowledgement.");
        }
        throw new InvalidOperationException("Brevo did not acknowledge email delivery with a message identifier.");
    }
}
