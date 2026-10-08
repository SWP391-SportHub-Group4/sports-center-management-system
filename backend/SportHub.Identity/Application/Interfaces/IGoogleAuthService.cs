using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Interfaces;

public interface IGoogleAuthService
{
    /// <summary>Đăng nhập Google: tự tạo tài khoản mới hoặc tự liên kết theo email đã xác minh (xem GoogleAuthService).</summary>
    Task<AuthResponse> LoginAsync(string idToken, CancellationToken ct = default);

    Task LinkAsync(Guid userId, string idToken, CancellationToken ct = default);

    Task UnlinkAsync(Guid userId, CancellationToken ct = default);
}
