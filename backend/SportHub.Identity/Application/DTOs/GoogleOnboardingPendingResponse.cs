namespace SportHub.Identity.Application.DTOs;

public sealed class GoogleOnboardingPendingResponse
{
    public bool RequiresOnboarding { get; init; } = true;

    public string OnboardingToken { get; init; } = string.Empty;

    public string Email { get; init; } = string.Empty;

    public string FullName { get; init; } = string.Empty;

    public DateTime ExpiresAt { get; init; }
}
