using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
    
    [Required, MaxLength(200)]
    public string Password { get; set; } = string.Empty;
}
