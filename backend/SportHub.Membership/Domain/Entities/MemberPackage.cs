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

    public int Version { get; set; } // optimistic concurrency token
}
