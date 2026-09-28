namespace SportHub.Identity.Application.DTOs;

public sealed class GoogleLoginResult
{
    public bool RequiresOnboarding { get; init; }

    public AuthResponse? Auth { get; init; }

    public GoogleOnboardingPendingResponse? Onboarding { get; init; }
}
