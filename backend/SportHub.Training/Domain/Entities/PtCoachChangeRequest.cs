using SportHub.Identity.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

/// <summary>
/// Mới 29/09/2026 (BE-4). Member xin đổi PersonalTrainer đang phụ trách entitlement của mình.
/// Duyệt: đổi PtEntitlement.CoachId, kết thúc/tạo lại CoachMemberRelationship, chuyển từng
/// PtSession tương lai Scheduled sang Coach mới nếu không conflict (conflict giữ Coach cũ).
/// </summary>
public class PtCoachChangeRequest
{
    public Guid RequestId { get; set; } // PK

    public Guid EntitlementId { get; set; } // FK -> PtEntitlement

    public PtEntitlement? Entitlement { get; set; }

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    public Guid CurrentCoachId { get; set; }

    public UserAccount? CurrentCoach { get; set; }

    public Guid RequestedCoachId { get; set; } // phải là PersonalTrainer active

    public UserAccount? RequestedCoach { get; set; }

    public string? Reason { get; set; }

    public DateTime RequestedAt { get; set; }

    public PtCoachChangeRequestStatus Status { get; set; }

    public Guid? ReviewedByUserId { get; set; }

    public UserAccount? ReviewedByUser { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string? ReviewNote { get; set; }
}
