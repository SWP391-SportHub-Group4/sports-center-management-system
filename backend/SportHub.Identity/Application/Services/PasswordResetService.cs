using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Quên/đặt lại mật khẩu bằng LINK gửi qua email (BR-103/104).
/// - Forgot luôn trả kết quả trung tính: email không tồn tại, bị khóa hay đang trong thời gian chờ đều như nhau
///   (UI: "Nếu có tài khoản gắn với email này, chúng tôi đã gửi link…") để không lộ email nào đã đăng ký.
/// - Link mang token ngẫu nhiên 256-bit, chỉ lưu bản băm; quên mật khẩu hết hạn sau 10 phút,
///   link kích hoạt Staff sau 24 giờ, dùng một lần và chỉ link mới nhất hợp lệ.
/// - Reset không hỏi mật khẩu cũ; token tiêu trong cùng transaction đổi mật khẩu.
/// - Thành công đổi security stamp: mọi JWT cũ bị từ chối ở request kế tiếp.
/// </summary>
public sealed class PasswordResetService(
    ISportHubDbContext db,
    IPasswordHasher passwordHasher,
    EmailOtpFlow otpFlow,
    INotificationWriter notifications,
    IClock clock,
    IConfiguration configuration,
    IStaffInvitationExpiryReader invitationExpiry) : IPasswordResetService
{
    public async Task RequestAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        var email = request.Email.Trim();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Set<UserAccount>()
            .FromSqlInterpolated($"SELECT * FROM user_accounts WHERE email = {email} FOR UPDATE")
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || user.Status != UserStatus.Active)
        {
            return;
        }

        var baseUrl = FrontendBaseUrl();
        await db.Entry(user).Reference(u => u.Credential).LoadAsync(ct);
        if (string.IsNullOrEmpty(user.Credential?.PasswordHash)
            && await invitationExpiry.IsExpiredAsync(user.UserId, user.CreatedAt, clock.UtcNow, ct))
            return;
        var token = await otpFlow.IssueAsync(email, EmailOtpPurpose.ResetPassword, ct,
            resetLink: t => $"{baseUrl}/reset-password?email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(t)}",
            supportUrl: configuration["Frontend:SupportUrl"]);

        if (token is null)
        {
            return; // đang chờ gửi lại: vẫn trung tính, không tiết lộ cooldown
        }

        // EmailOtpFlow writes the token hash and its encrypted email outbox row in one SaveChanges.
        await tx.CommitAsync(ct);
    }

    public async Task ResetAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        PasswordPolicyGuard.EnforceConfirmation(request.NewPassword, request.ConfirmNewPassword);

        var email = request.Email.Trim();
        PasswordPolicyGuard.Enforce(request.NewPassword, email);

        var otpId = await otpFlow.VerifyAsync(email, EmailOtpPurpose.ResetPassword, request.Token, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var lockedUser = await db.Set<UserAccount>()
            .FromSqlInterpolated($"SELECT * FROM user_accounts WHERE email = {email} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (lockedUser is null)
            throw new BadRequestException("otp_invalid", "Otp invalid.");

        var user = await db.Set<UserAccount>()
            .Include(u => u.Credential)
            .Include(u => u.Role)
            .Include(u => u.ExternalLogins)
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || user.Status != UserStatus.Active)
        {
            throw new BadRequestException("otp_invalid", "Otp invalid.");
        }

        var noPassword = string.IsNullOrEmpty(user.Credential?.PasswordHash);
        var activatingStaff = noPassword && user.Role?.RoleName != UserRole.Member;
        if (activatingStaff && await invitationExpiry.IsExpiredAsync(user.UserId, user.CreatedAt, clock.UtcNow, ct))
            throw new BadRequestException("staff_invitation_expired", "The staff activation invitation has expired.");

        // Recheck under the lock: resend/deletion may have changed the OTP while we waited.
        otpId = await otpFlow.VerifyAsync(email, EmailOtpPurpose.ResetPassword, request.Token, ct);
        await otpFlow.ConsumeAsync(otpId, ct);
        // Member đăng ký tại quầy: chưa có mật khẩu và chưa liên kết Google (Member Google-only đặt mật khẩu theo luồng khác).
        var activatingMember = noPassword && user.Role?.RoleName == UserRole.Member && user.ExternalLogins.Count == 0;
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

        notifications.QueueEmail(new EmailNotificationRequest(user.UserId, user.Email, NotificationEvents.PasswordChanged,
            Guid.NewGuid(),
            activatingStaff ? StaffActivationCompleteEmail.Subject
                : activatingMember ? MemberActivationCompleteEmail.Subject
                : PasswordChangedEmail.Subject,
            activatingStaff
                ? StaffActivationCompleteEmail.Render(configuration["Frontend:SupportUrl"])
                : activatingMember
                    ? MemberActivationCompleteEmail.Render(configuration["Frontend:SupportUrl"])
                    : PasswordChangedEmail.Render(PasswordChangedEmail.FormatLocal(clock.UtcNow), configuration["Frontend:SupportUrl"])));

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
