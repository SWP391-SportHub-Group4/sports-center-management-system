using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Vòng đời OTP email cho quên mật khẩu bằng link, kích hoạt Staff bằng link,
/// và đặt mật khẩu lần đầu bằng mã 6 số. Thời hạn mặc định 10 phút; link staff dùng hạn tuyệt đối từ lúc tạo tài khoản;
/// tối đa 5 lần sai, gửi lại sau 60 giây, chỉ mã mới nhất còn hiệu lực, băm SHA-256, dùng một lần.
///
/// - Lần nhập sai được đếm bằng UPDATE nguyên tử và commit ngay, không nằm trong transaction nào có thể rollback.
/// - <see cref="ConsumeAsync"/> là UPDATE có điều kiện: hai request cùng mã đúng song song thì đúng một request thắng.
///   Gọi nó BÊN TRONG transaction của thao tác nghiệp vụ để mã chỉ bị tiêu khi thao tác thành công.
/// </summary>
public sealed class EmailOtpFlow(ISportHubDbContext db, IClock clock, INotificationWriter notifications)
{
    /// <summary>
    /// Ghi/ghi đè mã cho (email, purpose) và trả mã rõ để caller gửi. Trả null nếu còn trong thời gian chờ gửi lại
    /// hoặc có request song song vừa tạo mã.
    /// </summary>
    public async Task<string?> IssueAsync(
        string email, EmailOtpPurpose purpose, CancellationToken ct, Func<string, string>? resetLink = null,
        string? supportUrl = null, TimeSpan? lifetime = null, string? resetEmailSubject = null,
        Func<string, int, string>? renderResetEmail = null, DateTime? expiresAtUtc = null)
    {
        // Đặt lại mật khẩu chỉ đi bằng link; không bao giờ gửi mã 6 số cho mục đích này.
        if (purpose == EmailOtpPurpose.ResetPassword && resetLink is null)
        {
            throw new InvalidOperationException("Password reset uses a link, not an OTP code.");
        }

        // Đặt mật khẩu lần đầu (tài khoản Google) chỉ đi bằng mã 6 số.
        if (purpose == EmailOtpPurpose.SetPassword && resetLink is not null)
        {
            throw new InvalidOperationException("Initial password setup uses an OTP code, not a link.");
        }

        var now = clock.UtcNow;
        var otp = await db.Set<EmailOtp>().SingleOrDefaultAsync(o => o.Email == email && o.Purpose == purpose, ct);

        if (otp is not null && now - otp.CreatedAt < AuthService.OtpResendCooldown)
        {
            return null;
        }

        // resetLink != null: gửi LINK đặt lại mật khẩu mang token dài (không phải mã 6 số). Cùng bảng/vòng đời
        // (hết hạn, một lần, chỉ bản mới nhất còn hiệu lực), chỉ khác định dạng bí mật trong email.
        var code = resetLink is null ? OtpCodes.Generate() : OtpCodes.GenerateLinkToken();

        if (otp is null)
        {
            otp = new EmailOtp { EmailOtpId = Guid.NewGuid(), Email = email, Purpose = purpose };
            db.Set<EmailOtp>().Add(otp);
        }

        otp.CodeHash = OtpCodes.Hash(code);
        var validFor = expiresAtUtc.HasValue ? expiresAtUtc.Value - now : lifetime ?? AuthService.OtpLifetime;
        if (validFor <= TimeSpan.Zero)
            throw new BadRequestException("otp_expired", "The activation deadline has passed.");
        otp.ExpiresAt = expiresAtUtc ?? now + validFor;
        otp.Attempts = 0;
        otp.ConsumedAt = null;
        otp.CreatedAt = now;

        if (purpose == EmailOtpPurpose.ResetPassword)
        {
            var url = resetLink!(code);
            notifications.QueueEmail(new EmailNotificationRequest(null, email, NotificationEvents.PasswordResetOtpRequested,
                Guid.NewGuid(), resetEmailSubject ?? PasswordResetEmail.Subject,
                renderResetEmail?.Invoke(url, (int)validFor.TotalMinutes)
                ?? PasswordResetEmail.Render(url, (int)validFor.TotalMinutes, supportUrl)));
        }
        else if (purpose == EmailOtpPurpose.SetPassword)
        {
            notifications.QueueEmail(new EmailNotificationRequest(null, email, NotificationEvents.PasswordResetOtpRequested,
                Guid.NewGuid(), SetPasswordEmail.Subject,
                SetPasswordEmail.Render(code, (int)validFor.TotalMinutes, supportUrl)));
        }
        else
        {
            throw new ArgumentOutOfRangeException(nameof(purpose), purpose, "EmailOtpFlow only supports password reset and initial password setup.");
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Request song song cùng email: unique (email, purpose) chặn request sau.
            return null;
        }

        return code;
    }

    /// <summary>Bỏ mã vừa lưu (gửi email hỏng) để cooldown không chặn người dùng thử lại.</summary>
    public async Task DiscardAsync(string email, EmailOtpPurpose purpose)
        => await db.Set<EmailOtp>()
            .Where(o => o.Email == email && o.Purpose == purpose)
            .ExecuteDeleteAsync(CancellationToken.None);

    /// <summary>
    /// Kiểm tra mã theo thứ tự: không có / đã dùng / hết hạn / hết lượt / sai. Không tiêu mã.
    /// Trả EmailOtpId để <see cref="ConsumeAsync"/>.
    /// </summary>
    public async Task<Guid> VerifyAsync(string email, EmailOtpPurpose purpose, string code, CancellationToken ct)
    {
        var otp = await db.Set<EmailOtp>()
                      .AsNoTracking()
                      .SingleOrDefaultAsync(o => o.Email == email && o.Purpose == purpose, ct)
                  ?? throw new BadRequestException("otp_invalid", "Otp invalid.");

        if (otp.ConsumedAt is not null)
        {
            throw new BadRequestException("otp_already_used", "Otp already used.");
        }

        if (clock.UtcNow >= otp.ExpiresAt)
        {
            throw new BadRequestException("otp_expired", "Otp expired.");
        }

        if (otp.Attempts >= AuthService.OtpMaxAttempts)
        {
            throw new BadRequestException(
                "otp_attempts_exceeded", "Otp attempts exceeded.");
        }

        if (!OtpCodes.Matches(code, otp.CodeHash))
        {
            await db.Set<EmailOtp>()
                .Where(o => o.EmailOtpId == otp.EmailOtpId)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.Attempts, o => o.Attempts + 1), ct);

            throw new BadRequestException("otp_invalid", "Otp invalid.");
        }

        return otp.EmailOtpId;
    }

    public async Task ConsumeAsync(Guid emailOtpId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var consumed = await db.Set<EmailOtp>()
            .Where(o => o.EmailOtpId == emailOtpId && o.ConsumedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.ConsumedAt, now), ct);

        if (consumed == 0)
        {
            throw new BadRequestException("otp_already_used", "Otp already used.");
        }
    }
}
