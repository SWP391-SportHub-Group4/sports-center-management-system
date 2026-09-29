using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

/// <summary>
/// Mới 29/09/2026 (BE-4). Quyền lợi/quota PT do Payment tạo ở PendingPayment và kích hoạt sau
/// thanh toán qua IPtEntitlementLifecycle (application contract, không phải HTTP). Không dùng
/// MemberPackage.RemainingSessions cho PT — quota theo dõi độc lập ở đây.
///
/// RemainingQuota = TotalQuota - ReservedSessions - ConsumedSessions.
/// </summary>
public class PtEntitlement
{
    public Guid EntitlementId { get; set; } // PK

    // UUID opaque, nullable khi PendingPayment, unique khi có giá trị — Payment dùng để
    // activate idempotent (vd theo InvoiceItemId).
    public Guid? ActivationReference { get; set; }

    public Guid MemberId { get; set; } // FK -> UserAccount

    public UserAccount? Member { get; set; }

    public Guid OriginMemberPackageId { get; set; } // FK -> MemberPackage, Membership Active lúc checkout PT

    public MemberPackage? OriginMemberPackage { get; set; }

    public Guid CurrentMemberPackageId { get; set; } // FK -> MemberPackage, đang cấp validity hiện hành

    public MemberPackage? CurrentMemberPackage { get; set; }

    public Guid CoachId { get; set; } // FK -> UserAccount, PersonalTrainer đã chọn

    public UserAccount? Coach { get; set; }

    public int FrequencyPerWeek { get; set; } // chỉ 1, 2 hoặc 3 — chỉ dùng tính TotalQuota

    public int TotalQuota { get; set; }

    public int ReservedSessions { get; set; }

    public int ConsumedSessions { get; set; }

    public DateOnly ValidityStartDate { get; set; }

    public DateOnly ValidityEndDate { get; set; }

    public DateOnly CarryOverUntilDate { get; set; } // ValidityEndDate + 30 ngày (BR-66)

    public PtEntitlementStatus Status { get; set; }

    public DateTime? ActivatedAt { get; set; }

    public DateTime? CancelledAt { get; set; }

    public int Version { get; set; } // optimistic concurrency token — bắt buộc dùng thật khi lock

    public ICollection<PtSession> Sessions { get; set; } = new List<PtSession>();

    public ICollection<PtCoachChangeRequest> CoachChangeRequests { get; set; } = new List<PtCoachChangeRequest>();
}
