using Microsoft.Extensions.Configuration;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Enums;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Application.Services;

/// <summary>
/// Issues single-use activation links: staff links use the fixed account deadline; Member links last 24 hours from issuance.
/// đăng ký tại quầy. Mỗi lần phát hành vô hiệu link cũ của cùng email; trả false nếu còn trong thời gian chờ gửi lại (60 giây).
/// Caller giữ transaction: <see cref="EmailOtpFlow"/> lưu cùng lúc mọi thay đổi đang chờ.
/// </summary>
public sealed class ActivationLinkService(EmailOtpFlow otpFlow, IConfiguration configuration, IClock clock)
{
    public async Task<bool> IssueAsync(string email, string fullName, bool member, CancellationToken ct,
        DateTime? expiresAtUtc = null)
    {
        if (!member && expiresAtUtc <= clock.UtcNow)
            throw new ConflictException("staff_invitation_expired", "The staff activation invitation has expired.");
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
            expiresAtUtc: member ? null : expiresAtUtc,
            resetEmailSubject: member ? MemberActivationEmail.Subject : StaffActivationEmail.Subject,
            renderResetEmail: (url, minutes) => member
                ? MemberActivationEmail.Render(fullName, url, minutes, support)
                : StaffActivationEmail.Render(fullName, url, minutes, support, expiresAtUtc));
        return token is not null;
    }
}
