using SportHub.Identity.Application.Commands;

namespace SportHub.Identity.Application.Interfaces;

public interface IPasswordResetService
{
    /// <summary>Luôn hoàn thành bình thường, kể cả khi email không tồn tại/bị khóa/đang chờ cooldown.</summary>
    Task RequestAsync(ForgotPasswordRequest request, CancellationToken ct = default);

    Task ResetAsync(ResetPasswordRequest request, CancellationToken ct = default);
}
