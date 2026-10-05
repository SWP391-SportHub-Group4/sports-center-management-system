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
    public const string Subject = "SportHub - Đặt lại mật khẩu";

    public static string Render(string resetUrl, int validMinutes)
    {
        var url = WebUtility.HtmlEncode(resetUrl);
        return $$"""
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{Subject}}</title>
</head>
<body style="margin:0;padding:0;background:#ebeff0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ebeff0;">Dùng liên kết trong email để chọn mật khẩu mới. Liên kết hết hạn sau {{validMinutes}} phút.</div>
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
            <h1 style="margin:0 0 16px 0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:32px;line-height:1.15;font-weight:700;color:#090e0f;">Quên mật khẩu?</h1>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#414d4e;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản SportHub của bạn.</p>
            <p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#414d4e;">Nhấn nút bên dưới để chọn mật khẩu mới.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" bgcolor="#02717a" style="border-radius:10px;">
                  <a href="{{url}}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.5px;color:#ffffff;text-decoration:none;border-radius:10px;">ĐẶT LẠI MẬT KHẨU</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:14px;line-height:1.6;color:#596668;">
            <p style="margin:0 0 12px 0;">Liên kết chỉ có hiệu lực trong <strong style="color:#192122;">{{validMinutes}} phút</strong> và dùng được một lần. Sau thời gian này, bạn cần chọn &ldquo;Quên mật khẩu&rdquo; trên trang đăng nhập để nhận liên kết mới.</p>
            <p style="margin:0 0 12px 0;">Nút không bấm được? Sao chép liên kết sau vào trình duyệt:</p>
            <p style="margin:0;word-break:break-all;"><a href="{{url}}" target="_blank" style="color:#02717a;">{{url}}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:13px;line-height:1.6;color:#798688;">
            <div style="border-top:1px solid #d8e0e1;padding-top:20px;">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này &mdash; mật khẩu hiện tại của bạn vẫn giữ nguyên.</div>
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
