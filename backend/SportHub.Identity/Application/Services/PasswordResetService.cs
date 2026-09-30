using Microsoft.EntityFrameworkCore;
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
    EmailOtpFlow otpFlow) : IPasswordResetService
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

        // EmailOtpFlow writes the OTP and its encrypted email outbox row in one SaveChanges.
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
