using SportHub.Notification.Infrastructure;

namespace SportHub.Notification.Infrastructure;

/// <summary>Centralizes the minimal responsive wrapper around trusted, escaped outbox fragments.</summary>
public static class EmailTemplateRenderer
{
    public static string Render(EmailPayload payload)
        => "<!doctype html><html><body style=\"font-family:Arial,sans-serif;line-height:1.5\">"
           + payload.HtmlBody + "</body></html>";
}
