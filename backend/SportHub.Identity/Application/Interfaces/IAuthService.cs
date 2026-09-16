using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(
        RegisterRequest request,
        CancellationToken cancellationToken = default);
}
