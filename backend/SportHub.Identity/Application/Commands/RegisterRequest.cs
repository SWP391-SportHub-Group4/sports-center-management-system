using System.ComponentModel.DataAnnotations;
using System.Text;

namespace SportHub.Identity.Application.Commands;

public class RegisterRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8)]
    [MaxPasswordBytes(72)]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string FullName { get; set; } = string.Empty;

    public string? Phone { get; set; }
}

public sealed class MaxPasswordBytesAttribute(int maxBytes) : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not string password || Encoding.UTF8.GetByteCount(password) <= maxBytes)
        {
            return ValidationResult.Success;
        }

        return new ValidationResult($"Password must not exceed {maxBytes} bytes.");
    }
}
