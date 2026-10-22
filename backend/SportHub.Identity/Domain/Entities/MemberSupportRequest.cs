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
}
