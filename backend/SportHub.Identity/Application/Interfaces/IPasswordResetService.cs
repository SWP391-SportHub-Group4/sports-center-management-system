using SportHub.Identity.Application.Commands;

namespace SportHub.Identity.Application.Interfaces;

public interface IPasswordResetService
{
    /// <summary>
    /// Gửi link đặt lại mật khẩu. Email không tồn tại → 404 account_not_found; tài khoản bị khóa → 403
    /// account_not_active; còn trong thời gian chờ gửi lại → 409 reset_link_recently_sent.
    /// </summary>
    Task RequestAsync(ForgotPasswordRequest request, CancellationToken ct = default);

    Task ResetAsync(ResetPasswordRequest request, CancellationToken ct = default);
}
