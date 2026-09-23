using SportHub.Identity.Domain.Entities;

namespace SportHub.Membership.Domain.Entities;

public class MemberPackage
{
    public Guid MemberPackageId { get; set; } // PK

    public Guid MemberId { get; set; } // FK -> UserAccount

    public UserAccount? Member { get; set; }

    public int PackageId { get; set; } // FK -> MembershipPackage

    public MembershipPackage? Package { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly EndDate { get; set; } // hết hiệu lực nếu quá mốc này

    public int? RemainingSessions { get; set; } // trừ nguyên tử mỗi lần Enrollment; null = không giới hạn

    public MemberPackageStatus Status { get; set; } // PendingPayment/Active/Expired/Cancelled

    // BR-10: mặc định chỉ 1 gói CÙNG PackageId được Active/member. Hai field này ghi lại
    // ngoại lệ "Center Manager cho phép cộng dồn rõ ràng" — null nghĩa là không có ngoại lệ
    // và ràng buộc được áp dụng chặt. Không mặc định cho mọi gói cộng dồn.
    public Guid? StackingApprovedByUserId { get; set; } // FK -> UserAccount (Center Manager)

    public UserAccount? StackingApprovedByUser { get; set; }

    public string? StackingApprovalReason { get; set; } // bắt buộc khi có StackingApprovedByUserId

    public int Version { get; set; } // optimistic concurrency token
}
