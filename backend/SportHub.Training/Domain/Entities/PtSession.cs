using SportHub.Identity.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

/// <summary>
/// Mới 29/09/2026 (BE-4). Buổi PT 90 phút, 1 Coach : 1 Member — không dùng Class/ClassSession/
/// Enrollment. Chỉ Scheduled chặn slot; không cho cùng Coach/Member có 2 session Scheduled
/// giao nhau trong khoảng [StartAtUtc, EndAtUtc).
/// </summary>
public class PtSession
{
    public Guid SessionId { get; set; } // PK

    public Guid EntitlementId { get; set; } // FK -> PtEntitlement

    public PtEntitlement? Entitlement { get; set; }

    public Guid MemberId { get; set; } // Snapshot/FK để query + ràng buộc overlap, phải khớp Entitlement.MemberId

    public UserAccount? Member { get; set; }

    public Guid CoachId { get; set; } // Coach thực tế của session — giữ nguyên lịch sử khi đổi Coach

    /// <summary>Phòng tập (tùy chọn). Có phòng thì chiếm cả room occupancy (kiểm giờ mở cửa/tương thích); coach occupancy luôn có. Cross-module: chỉ scalar.</summary>
    public int? RoomId { get; set; }

    public UserAccount? Coach { get; set; }

    public DateTime StartAtUtc { get; set; }

    public DateTime EndAtUtc { get; set; } // = StartAtUtc + 90 phút, server tự tính

    public PtSessionStatus Status { get; set; }

    public PtSessionQuotaState QuotaState { get; set; }

    public Guid? RescheduledFromSessionId { get; set; } // self-FK, nullable — trỏ về session cũ khi là session thay thế

    public PtSession? RescheduledFromSession { get; set; }

    public Guid CreatedByUserId { get; set; } // Manager tạo lịch

    public DateTime? CompletedAt { get; set; }

    public DateTime? CancelledAt { get; set; }

    public string? CancellationReason { get; set; }

    public int Version { get; set; } // optimistic concurrency token

    public WorkoutResult? Result { get; set; }

    public ICollection<PtSessionChangeRequest> ChangeRequests { get; set; } = new List<PtSessionChangeRequest>();
}
