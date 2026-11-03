using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Interfaces;

public interface IAuthService
{
    Task RequestRegisterOtpAsync(
        RequestRegisterOtpRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthResponse> RegisterAsync(
        RegisterRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthResponse> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default);
}
