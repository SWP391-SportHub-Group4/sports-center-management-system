namespace SportHub.Identity.Domain.Entities;

/// <summary>Một dòng lịch sử xử lý yêu cầu hỗ trợ: tạo, phân công, cập nhật tiến độ, hoàn thành, từ chối.</summary>
public sealed class MemberSupportEvent
{
    public Guid EventId { get; set; }

    public Guid RequestId { get; set; }

    public Guid ActorUserId { get; set; }

    /// <summary>CREATED, ASSIGNED, PROGRESS, DONE, REJECTED.</summary>
    public string Type { get; set; } = string.Empty;

    public string? Note { get; set; }

    /// <summary>Người được giao (với ASSIGNED).</summary>
    public Guid? TargetUserId { get; set; }

    public DateTime CreatedAt { get; set; }
}
