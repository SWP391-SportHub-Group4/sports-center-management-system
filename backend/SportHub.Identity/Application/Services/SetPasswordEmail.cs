using System.Net;

namespace SportHub.Identity.Application.Services;

/// <summary>Email mã xác nhận khi tài khoản đăng ký bằng Google tạo mật khẩu lần đầu. Kiểu inline, bảng bố cục như PasswordResetEmail.</summary>
public static class SetPasswordEmail
{
    public const string Subject = "SportHub - Mã xác nhận tạo mật khẩu";

    public static string Render(string code, int validMinutes, string? supportUrl = null)
    {
        var support = string.IsNullOrWhiteSpace(supportUrl)
            ? "Mọi thắc mắc xin vui lòng liên hệ trung tâm."
            : "Mọi thắc mắc xin vui lòng liên hệ website: <a href=\"" + WebUtility.HtmlEncode(supportUrl) + "\" target=\"_blank\" style=\"color:#02717a;\">"
              + WebUtility.HtmlEncode(supportUrl) + "</a>";
        return $$"""
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{Subject}}</title>
</head>
<body style="margin:0;padding:0;background:#ebeff0;">
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
            <h1 style="margin:0 0 16px 0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:32px;line-height:1.15;font-weight:700;color:#090e0f;">Tạo mật khẩu cho tài khoản</h1>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#414d4e;">Nhập mã dưới đây vào trang Cài đặt tài khoản để xác nhận bạn là chủ của email này.</p>
            <p style="margin:0 0 20px 0;font-size:32px;font-weight:700;letter-spacing:6px;color:#002528;">{{code}}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 0 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:14px;line-height:1.6;color:#596668;">
            <p style="margin:0 0 12px 0;">Mã có hiệu lực trong <strong style="color:#192122;">{{validMinutes}} phút</strong> và dùng được một lần.</p>
            <p style="margin:0;">{{support}}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:13px;line-height:1.6;color:#798688;">
            <div style="border-top:1px solid #d8e0e1;padding-top:20px;">Nếu bạn không yêu cầu tạo mật khẩu, hãy bỏ qua email này. Không ai có thể đổi mật khẩu nếu không có mã này.</div>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0 0;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:12px;color:#798688;">SportHub &middot; Trung tâm thể thao đa môn</p>
    </td>
  </tr>
</table>
</body>
</html>
""";
    }
}
