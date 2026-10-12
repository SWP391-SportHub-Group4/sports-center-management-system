using System.Net;

namespace SportHub.Identity.Application.Services;

public static class MemberActivationEmail
{
    public const string Subject = "SportHub - Activate your SportHub account";

    public static string Render(string fullName, string setupUrl, int validMinutes, string? supportUrl = null)
    {
        var name = WebUtility.HtmlEncode(fullName);
        var url = WebUtility.HtmlEncode(setupUrl);
        var support = string.IsNullOrWhiteSpace(supportUrl)
            ? "Contact the center if you need help."
            : $"Contact the center if you need help: <a href=\"{WebUtility.HtmlEncode(supportUrl)}\">{WebUtility.HtmlEncode(supportUrl)}</a>.";

        return $$"""
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{Subject}}</title></head>
<body style="margin:0;padding:32px 16px;background:#ebeff0;font-family:Arial,sans-serif;color:#192122;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#002528;color:#fff;font-size:28px;font-weight:700;">SPORT<span style="color:#c8f03a;">HUB</span></td></tr>
    <tr><td style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:28px;">Set up your SportHub account</h1>
      <p>Hello {{name}},</p>
      <p>The front desk created a SportHub member account for this email address. Set your own password to activate access.</p>
      <p style="margin:28px 0;"><a href="{{url}}" style="display:inline-block;padding:14px 24px;background:#02717a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">SET YOUR PASSWORD</a></p>
      <p>This link expires in {{validMinutes / 60}} hours and can be used once.</p>
      <p>If the button does not work, copy this link: <a href="{{url}}">{{url}}</a></p>
      <p>{{support}}</p>
      <p>If you were not expecting this invitation, you can ignore it. No password has been set for this account.</p>
    </td></tr>
  </table>
</body>
</html>
""";
    }
}
