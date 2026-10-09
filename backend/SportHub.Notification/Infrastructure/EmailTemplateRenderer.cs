using SportHub.Notification.Infrastructure;

namespace SportHub.Notification.Infrastructure;

/// <summary>Centralizes the minimal responsive wrapper around trusted, escaped outbox fragments.</summary>
public static class EmailTemplateRenderer
{
    public static string Render(EmailPayload payload)
        // Bản đã là tài liệu HTML đầy đủ (vd. email đặt lại mật khẩu) thì giữ nguyên: lồng <html> trong <html>
        // làm một số bộ lọc thư đánh giá thư là rác.
        => payload.HtmlBody.TrimStart().StartsWith("<!doctype", StringComparison.OrdinalIgnoreCase)
            ? payload.HtmlBody
            : "<!doctype html><html><body style=\"font-family:Arial,sans-serif;line-height:1.5\">"
              + payload.HtmlBody + "</body></html>";
}
