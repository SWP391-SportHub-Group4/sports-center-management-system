using System.Net;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Email "Đặt lại mật khẩu" theo bộ nhận diện Court &amp; Volt (DESIGN-TOKENS). Email client không đọc CSS ngoài
/// hay biến CSS nên mọi kiểu đều inline, bố cục bằng table, màu là giá trị hex của token:
/// Court-600 #02717a (nút), Court-900 #002528 (dải đầu), Volt-400 #c8f03a (điểm nhấn wordmark), Chalk (chữ/nền).
/// Nút là thẻ &lt;a&gt; trong ô table có nền để vẫn bấm được khi client chặn ảnh/CSS; có link dán tay dự phòng.
/// </summary>
public static class PasswordResetEmail
{
    public const string Subject = "SportHub - Reset your password";

    public static string Render(string resetUrl, int validMinutes, string? supportUrl = null)
    {
        var url = WebUtility.HtmlEncode(resetUrl);
        var support = string.IsNullOrWhiteSpace(supportUrl)
            ? "If you have questions, please contact the center."
            : "If you have questions, visit: <a href=\"" + WebUtility.HtmlEncode(supportUrl) + "\" target=\"_blank\" style=\"color:#02717a;\">"
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ebeff0;">Use the link in this email to set a new password. It expires in {{validMinutes}} minutes.</div>
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
            <h1 style="margin:0 0 16px 0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:32px;line-height:1.15;font-weight:700;color:#090e0f;">Forgot your password?</h1>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#414d4e;">We received a request to reset your SportHub password.</p>
            <p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#414d4e;">Select the button below to choose a new password.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" bgcolor="#02717a" style="border-radius:10px;">
                  <a href="{{url}}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.5px;color:#ffffff;text-decoration:none;border-radius:10px;">RESET PASSWORD</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:14px;line-height:1.6;color:#596668;">
            <p style="margin:0 0 12px 0;">This link is valid for <strong style="color:#192122;">{{validMinutes}} minutes</strong> and can be used once. After it expires, select &ldquo;Forgot password&rdquo; on the sign-in page to request another link.</p>
            <p style="margin:0;">{{support}}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:13px;line-height:1.6;color:#798688;">
            <div style="border-top:1px solid #d8e0e1;padding-top:20px;">If you did not request a password reset, you can ignore this email. Your current password remains unchanged.</div>
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
}
