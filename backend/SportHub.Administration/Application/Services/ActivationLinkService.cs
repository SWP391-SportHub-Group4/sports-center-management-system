using Microsoft.Extensions.Configuration;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Application.Services;

/// <summary>
/// Phát hành link kích hoạt (24 giờ, dùng một lần) cho tài khoản do người khác tạo hộ: staff do Admin tạo, Member do Receptionist
/// đăng ký tại quầy. Mỗi lần phát hành vô hiệu link cũ của cùng email; trả false nếu còn trong thời gian chờ gửi lại (60 giây).
/// Caller giữ transaction: <see cref="EmailOtpFlow"/> lưu cùng lúc mọi thay đổi đang chờ.
/// </summary>
public sealed class ActivationLinkService(EmailOtpFlow otpFlow, IConfiguration configuration)
{
    public async Task<bool> IssueAsync(string email, string fullName, bool member, CancellationToken ct)
    {
        var frontendBaseUrl = configuration["Frontend:BaseUrl"];
        if (string.IsNullOrWhiteSpace(frontendBaseUrl))
            frontendBaseUrl = configuration.GetSection("Cors:AllowedOrigins").GetChildren()
                .Select(c => c.Value).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
        frontendBaseUrl = (string.IsNullOrWhiteSpace(frontendBaseUrl) ? "http://localhost:3000" : frontendBaseUrl).TrimEnd('/');
        var setup = member ? "member" : "staff";
        var support = configuration["Frontend:SupportUrl"];

        var token = await otpFlow.IssueAsync(email, EmailOtpPurpose.ResetPassword, ct,
            resetLink: value => $"{frontendBaseUrl}/reset-password?email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(value)}&setup={setup}",
            supportUrl: support,
            lifetime: TimeSpan.FromHours(24),
            resetEmailSubject: member ? MemberActivationEmail.Subject : StaffActivationEmail.Subject,
            renderResetEmail: (url, minutes) => member
                ? MemberActivationEmail.Render(fullName, url, minutes, support)
                : StaffActivationEmail.Render(fullName, url, minutes, support));
        return token is not null;
    }
}
