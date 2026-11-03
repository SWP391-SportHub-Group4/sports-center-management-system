using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Scheduling.Domain.Exceptions;

// Target của Gym check-in không tồn tại hoặc không phải role Member.
// Gộp hai trường hợp vào một lỗi 404: phân biệt chúng sẽ để lộ sự tồn tại của
// user id không phải Member cho Lễ tân đang dò.
public sealed class MemberNotFoundException(Guid memberId)
    : DomainException("Member not found.")
{
    public Guid MemberId { get; } = memberId;
}
