using System.Net;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Email xác nhận "Mật khẩu đã được thay đổi" (BR-103/104). Gửi tới email của tài khoản sau khi đổi, đặt lại
/// hoặc tạo mật khẩu lần đầu thành công, để chủ tài khoản phát hiện việc đổi không phải do mình thực hiện.
/// Không chứa mật khẩu, mã hay link xác thực. Kiểu inline và bảng bố cục như PasswordResetEmail.
/// </summary>
public static class PasswordChangedEmail
{
    public const string Subject = "SportHub - Your password was changed";

    public static string Render(string changedAtLocal, string? supportUrl = null)
    {
        var when = WebUtility.HtmlEncode(changedAtLocal);
        var support = string.IsNullOrWhiteSpace(supportUrl)
            ? "Please contact the center immediately."
            : "Please contact the center immediately: <a href=\"" + WebUtility.HtmlEncode(supportUrl) + "\" target=\"_blank\" style=\"color:#02717a;\">"
              + WebUtility.HtmlEncode(supportUrl) + "</a>";
        return $$"""
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{Subject}}</title>
</head>
<body style="margin:0;padding:0;background:#ebeff0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ebeff0;">Your SportHub password was changed on {{when}}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebeff0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#002528;padding:24px 32px;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:1px;line-height:1;color:#ffffff;">
            SPORT<span style="color:#c8f03a;">HUB</span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 8px 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;color:#192122;">
            <h1 style="margin:0 0 16px 0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:32px;line-height:1.15;font-weight:700;color:#090e0f;">Your password was changed</h1>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#414d4e;">The password for your SportHub account was changed on <strong style="color:#192122;">{{when}}</strong> (Vietnam time).</p>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#414d4e;">For your security, you have been signed out of other devices.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:14px;line-height:1.6;color:#596668;">
            <p style="margin:0;"><strong style="color:#192122;">Was this not you?</strong> Use &ldquo;Forgot password&rdquo; on the sign-in page to reset it now. {{support}}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:13px;line-height:1.6;color:#798688;">
            <div style="border-top:1px solid #d8e0e1;padding-top:20px;">If you made this change, no further action is needed. We will never ask for your password by email.</div>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0 0;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:12px;color:#798688;">SportHub &middot; Multi-sport center</p>
    </td>
  </tr>
</table>
</body>
</html>
""";
    }

    public static string FormatLocal(DateTime utc)
        => SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(utc).ToString("dd/MM/yyyy HH:mm");
}
