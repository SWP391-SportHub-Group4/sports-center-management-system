using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public sealed class CompleteGoogleOnboardingRequest
{
    [Required]
    public string OnboardingToken { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }

    [Required, MinLength(8), MaxPasswordBytes(72)]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string ConfirmPassword { get; set; } = string.Empty;
}
