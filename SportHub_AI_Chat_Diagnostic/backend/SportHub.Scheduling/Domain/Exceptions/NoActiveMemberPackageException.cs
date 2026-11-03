using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Scheduling.Domain.Exceptions;

// BR-64: Gym check-in chỉ được ghi nhận khi Member có >= 1 MemberPackage ở trạng thái
// Active tại thời điểm check-in. Không có gói nào => 409 Conflict (Design v2 §3 ràng buộc #18).
public sealed class NoActiveMemberPackageException(Guid memberId)
    : DomainException("Member does not have any active membership package.")
{
    public Guid MemberId { get; } = memberId;
}
