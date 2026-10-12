using System.Net;

namespace SportHub.Identity.Application.Services;

public static class MemberActivationCompleteEmail
{
    public const string Subject = "SportHub - Your SportHub account is ready";

    public static string Render(string? supportUrl = null)
    {
        var support = string.IsNullOrWhiteSpace(supportUrl)
            ? "Please contact the center immediately."
            : $"Please contact the center immediately: <a href=\"{WebUtility.HtmlEncode(supportUrl)}\">{WebUtility.HtmlEncode(supportUrl)}</a>.";

        return $$"""
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>{{Subject}}</title></head>
<body style="margin:0;padding:32px 16px;background:#ebeff0;font-family:Arial,sans-serif;color:#192122;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#002528;color:#fff;font-size:28px;font-weight:700;">SPORT<span style="color:#c8f03a;">HUB</span></td></tr>
    <tr><td style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:28px;">Your SportHub account is ready</h1>
      <p>Your email has been verified and your password has been set. You can now sign in to SportHub.</p>
      <p>If you did not set this password, {{support}}</p>
    </td></tr>
  </table>
</body>
</html>
""";
    }
}
