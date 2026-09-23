using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Email;

namespace SportHub.Identity.Infrastructure.Email;

/// <summary>
/// Fallback khi chưa cấu hình Smtp:Host — ghi nội dung email ra log thay vì gửi thật, để máy
/// dev/test cục bộ vẫn lấy được mã OTP và Register được. KHÔNG dùng ở môi trường thật: nội
/// dung (gồm cả mã OTP) nằm trong log.
/// </summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default)
    {
        logger.LogWarning(
            "Smtp:Host chưa cấu hình — email KHÔNG được gửi. To: {To} | Subject: {Subject} | Body: {Body}",
            toAddress,
            subject,
            htmlBody);

        return Task.CompletedTask;
    }
}
