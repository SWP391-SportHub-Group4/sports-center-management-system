using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

// BR-6 (một phần): chặn CẤP TOKEN MỚI cho account không Active.
// Không revoke token đã cấp trước khi account bị khoá — JWT hiện stateless, việc đó
// cần task riêng (check Status ở middleware / refresh token), ngoài phạm vi Login.
public sealed class AccountBlockedException(UserStatus status)
    : DomainException(status == UserStatus.Banned
        ? "This account has been banned."
        : "This account has been deactivated.")
{
    public UserStatus Status { get; } = status;
}
