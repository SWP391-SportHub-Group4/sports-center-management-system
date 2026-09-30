using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Interfaces;

public interface IGoogleAuthService
{
    Task<GoogleLoginResult> LoginAsync(string idToken, CancellationToken ct = default);

    Task<AuthResponse> CompleteOnboardingAsync(
        CompleteGoogleOnboardingRequest request,
        CancellationToken ct = default);

    Task LinkAsync(Guid userId, string idToken, CancellationToken ct = default);

    Task UnlinkAsync(Guid userId, CancellationToken ct = default);
}
