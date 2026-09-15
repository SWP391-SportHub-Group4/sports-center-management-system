using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public class RegisterRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8)]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string FullName { get; set; } = string.Empty;

    public string? Phone { get; set; }
}
