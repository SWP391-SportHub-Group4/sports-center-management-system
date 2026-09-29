using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Quên/đặt lại mật khẩu bằng OTP email (BR-103/104).
/// - Forgot luôn trả kết quả trung tính: email không tồn tại, bị khóa hay đang trong thời gian chờ đều như nhau.
/// - Reset không hỏi mật khẩu cũ; OTP dùng một lần và tiêu trong cùng transaction đổi mật khẩu.
/// - Thành công đổi security stamp: mọi JWT cũ bị từ chối ở request kế tiếp.
/// </summary>
public sealed class PasswordResetService(
    ISportHubDbContext db,
    IPasswordHasher passwordHasher,
    IEmailSender emailSender,
    EmailOtpFlow otpFlow,
    ILogger<PasswordResetService> logger) : IPasswordResetService
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

        var code = await otpFlow.IssueAsync(email, EmailOtpPurpose.ResetPassword, ct);
        if (code is null)
        {
            return; // đang chờ gửi lại: vẫn trung tính, không tiết lộ cooldown
        }

        try
        {
            await emailSender.SendAsync(
                email,
                "SportHub - Mã đặt lại mật khẩu",
                "<p>Mã đặt lại mật khẩu SportHub của bạn là:</p>"
                + "<p style=\"font-size:24px;font-weight:bold;letter-spacing:4px\">" + code + "</p>"
                + "<p>Mã có hiệu lực trong " + AuthService.OtpLifetime.TotalMinutes.ToString("0") + " phút. "
                + "Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>",
                ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Không báo lỗi ra ngoài (sẽ làm lộ email có tồn tại). Bỏ mã để người dùng thử lại ngay.
            logger.LogError(ex, "Không gửi được email đặt lại mật khẩu.");
            await otpFlow.DiscardAsync(email, EmailOtpPurpose.ResetPassword);
        }
    }

    public async Task ResetAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        PasswordPolicyGuard.EnforceConfirmation(request.NewPassword, request.ConfirmNewPassword);

        var email = request.Email.Trim();
        PasswordPolicyGuard.Enforce(request.NewPassword, email);

        var otpId = await otpFlow.VerifyAsync(email, EmailOtpPurpose.ResetPassword, request.OtpCode, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        await otpFlow.ConsumeAsync(otpId, ct);

        var user = await db.Set<UserAccount>()
            .Include(u => u.Credential)
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || user.Status != UserStatus.Active)
        {
            throw new BadRequestException("otp_invalid", "Mã xác thực không đúng.");
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
}
