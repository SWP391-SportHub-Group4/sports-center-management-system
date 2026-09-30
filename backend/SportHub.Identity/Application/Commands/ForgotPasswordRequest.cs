using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public sealed class ForgotPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}
