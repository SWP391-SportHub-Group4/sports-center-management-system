namespace SportHub.Identity.Infrastructure.Email;

/// <summary>Section "Smtp" trong cấu hình. Host rỗng = dùng LoggingEmailSender (máy dev).</summary>
public sealed class EmailOptions
{
    public string Host { get; set; } = string.Empty;

    public int Port { get; set; } = 587;

    public string Username { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public string FromAddress { get; set; } = string.Empty;

    public string FromName { get; set; } = "SportHub";

    /// <summary>true = SSL ngay khi kết nối (thường port 465); false = STARTTLS nếu server hỗ trợ (587).</summary>
    public bool UseSsl { get; set; }
}
