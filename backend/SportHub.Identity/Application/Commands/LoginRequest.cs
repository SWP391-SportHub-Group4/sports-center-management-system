using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
    
    [Required, MaxPasswordBytes(72)]
    public string Password { get; set; } = string.Empty;
}
