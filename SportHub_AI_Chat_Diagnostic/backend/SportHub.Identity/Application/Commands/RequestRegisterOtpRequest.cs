using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public class RequestRegisterOtpRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}
