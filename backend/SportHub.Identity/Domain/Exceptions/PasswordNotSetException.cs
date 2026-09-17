using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

// BR-60: tài khoản chưa từng đặt password (password_hash null).
// Message cố ý trung lập — password_hash null KHÔNG chứng minh account tạo qua Google;
// có thể là account staff do admin tạo mà chưa set password.
public sealed class PasswordNotSetException()
    : DomainException("This account has no password set yet. Try signing in another way, or set a password first.")
{
}
