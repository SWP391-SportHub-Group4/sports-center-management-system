using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

public class Notification
{
    public Guid NotificationId { get; set; } // PK

    public Guid UserId { get; set; } // FK -> UserAccount

    public UserAccount? User { get; set; }

    public NotificationChannel Channel { get; set; } // InApp/Email/Sms — MVP chỉ InApp hoạt động thật

    public NotificationSourceEventType SourceEventType { get; set; } // sự kiện sinh ra thông báo này

    public Guid? SourceEntityId { get; set; } // trỏ tới entity gây ra sự kiện (vd SessionId)

    public string Message { get; set; } = string.Empty;

    public NotificationStatus Status { get; set; } // Pending/Sent/Failed/Read

    public int RetryCount { get; set; } // số lần thử gửi lại khi Failed

    public DateTime? LastAttemptAt { get; set; }

    public DateTime? SentAt { get; set; }
}
