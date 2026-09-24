namespace SportHub.BuildingBlocks.Abstractions.Email;

/// <summary>
/// Gửi email ra ngoài. Hiện chỉ Identity dùng (OTP Register — BR-78); NotificationChannel.Email
/// vẫn chưa hoạt động và KHÔNG đi qua interface này.
/// </summary>
public interface IEmailSender
{
    Task SendAsync(string toAddress, string subject, string htmlBody, CancellationToken cancellationToken = default);
}
