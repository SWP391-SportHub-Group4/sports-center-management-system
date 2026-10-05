using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Quên/đặt lại mật khẩu bằng LINK gửi qua email (BR-103/104).
/// - Forgot luôn trả kết quả trung tính: email không tồn tại, bị khóa hay đang trong thời gian chờ đều như nhau
///   (UI: "Nếu có tài khoản gắn với email này, chúng tôi đã gửi link…") để không lộ email nào đã đăng ký.
/// - Link mang token ngẫu nhiên 256-bit, chỉ lưu bản băm; hết hạn 10 phút, dùng một lần, chỉ link mới nhất hợp lệ.
/// - Reset không hỏi mật khẩu cũ; token tiêu trong cùng transaction đổi mật khẩu.
/// - Thành công đổi security stamp: mọi JWT cũ bị từ chối ở request kế tiếp.
/// </summary>
public sealed class PasswordResetService(
    ISportHubDbContext db,
    IPasswordHasher passwordHasher,
    EmailOtpFlow otpFlow,
    IConfiguration configuration) : IPasswordResetService
{
    public async Task RequestAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        var email = request.Email.Trim();

        var user = await db.Set<UserAccount>()
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || user.Status != UserStatus.Active)
        {
            return;
        }

        var baseUrl = FrontendBaseUrl();
        var token = await otpFlow.IssueAsync(email, EmailOtpPurpose.ResetPassword, ct,
            resetLink: t => $"{baseUrl}/reset-password?email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(t)}",
            supportUrl: configuration["Frontend:SupportUrl"]);

        if (token is null)
        {
            return; // đang chờ gửi lại: vẫn trung tính, không tiết lộ cooldown
        }

        // EmailOtpFlow writes the token hash and its encrypted email outbox row in one SaveChanges.
    }

    public async Task ResetAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        PasswordPolicyGuard.EnforceConfirmation(request.NewPassword, request.ConfirmNewPassword);

        var email = request.Email.Trim();
        PasswordPolicyGuard.Enforce(request.NewPassword, email);

        var otpId = await otpFlow.VerifyAsync(email, EmailOtpPurpose.ResetPassword, request.Token, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        await otpFlow.ConsumeAsync(otpId, ct);

        var user = await db.Set<UserAccount>()
            .Include(u => u.Credential)
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || user.Status != UserStatus.Active)
        {
            throw new BadRequestException("otp_invalid", "Link đặt lại mật khẩu không hợp lệ.");
        }

        var hash = passwordHasher.Hash(request.NewPassword);

        if (user.Credential is null)
        {
            user.Credential = new UserCredential { UserId = user.UserId, PasswordHash = hash };
        }
        else
        {
            user.Credential.PasswordHash = hash;
        }

        user.SecurityStamp = Guid.NewGuid();

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    /// <summary>Gốc URL của frontend để dựng link: Frontend:BaseUrl, rồi origin CORS đầu tiên, rồi localhost.</summary>
    private string FrontendBaseUrl()
    {
        var configured = configuration["Frontend:BaseUrl"];
        if (string.IsNullOrWhiteSpace(configured))
        {
            configured = configuration.GetSection("Cors:AllowedOrigins").GetChildren()
                .Select(c => c.Value).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
        }

        return (string.IsNullOrWhiteSpace(configured) ? "http://localhost:3000" : configured).TrimEnd('/');
    }
}
