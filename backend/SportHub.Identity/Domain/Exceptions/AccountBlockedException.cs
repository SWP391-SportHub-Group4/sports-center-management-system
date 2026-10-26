using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

// BR-6 (một phần): chặn CẤP TOKEN MỚI cho account không Active.
// Existing tokens are checked against account status and security stamp on every request.
public sealed class AccountBlockedException(UserStatus status)
    : DomainException("This account has been deactivated.")
{
    public UserStatus Status { get; } = status;
}
