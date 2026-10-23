namespace SportHub.Identity.Domain.Entities;

public sealed class MemberSupportRequest
{
    public Guid RequestId { get; set; }

    public Guid MemberId { get; set; }

    public Guid RecordedByUserId { get; set; }

    public string Category { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Status { get; set; } = "OPEN";

    public DateTime CreatedAt { get; set; }

    public Guid? AssignedToUserId { get; set; }
    public string? ProgressNote { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }

    /// <summary>Kênh tiếp nhận: COUNTER, PHONE, FANPAGE (lễ tân ghi hộ) hoặc ONLINE (member tự gửi).</summary>
    public string Channel { get; set; } = "COUNTER";

    /// <summary>
    /// True với ticket PAYMENT tạo theo quy trình hoàn tiền ngân hàng (có bản ghi hoàn tiền bên Payment). Ticket PAYMENT cũ
    /// (false) vẫn đóng bằng done/reject thường nhưng chỉ Manager được xử lý.
    /// </summary>
    public bool RequiresPayout { get; set; }
}
