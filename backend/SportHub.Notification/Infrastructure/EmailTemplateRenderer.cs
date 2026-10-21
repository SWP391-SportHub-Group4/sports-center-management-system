using System.Net;

namespace SportHub.Notification.Infrastructure;

/// <summary>Centralizes the minimal responsive wrapper around trusted, escaped outbox fragments.</summary>
public static class EmailTemplateRenderer
{
    public static string Render(EmailPayload payload)
    {
        var body = payload.HtmlBody.TrimStart();
        if (body.StartsWith("<!doctype", StringComparison.OrdinalIgnoreCase)
            || body.StartsWith("<html", StringComparison.OrdinalIgnoreCase)) return payload.HtmlBody;
        var title = payload.Subject;
        foreach (var prefix in new[] { "SportHub - ", "SportHub · ", "SportHub – " })
            if (title.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) { title = title[prefix.Length..]; break; }
        var safeTitle = WebUtility.HtmlEncode(title);
        return $$"""
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{safeTitle}}</title></head>
<body style="margin:0;padding:0;background:#f2f4ed;color:#14271f;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4ed;color:#14271f;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:20px 24px;background:#14271f;color:#ffffff;font-size:22px;font-weight:700;">SPORT<span style="color:#d2f23c;">HUB</span></td></tr>
      <tr><td style="padding:28px 24px;overflow-wrap:anywhere;word-break:break-word;">
        <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;">{{safeTitle}}</h1>
        {{payload.HtmlBody}}
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #dce2d7;color:#52645a;font-size:13px;">SportHub · Sports Center Management</td></tr>
    </table>
  </td></tr></table>
</body></html>
""";
    }
}
