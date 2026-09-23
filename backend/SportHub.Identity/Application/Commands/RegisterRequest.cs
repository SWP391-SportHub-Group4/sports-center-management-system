using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.RegularExpressions;

namespace SportHub.Identity.Application.Commands;

public class RegisterRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8)]
    [MaxPasswordBytes(72)]
    public string Password { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
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

public sealed class FullNameAttribute(int minLength = 2, int maxLength = 100) : ValidationAttribute
{
    private static readonly Regex NamePattern = new(@"^[\p{L}][\p{L}\s'.-]*$", RegexOptions.Compiled);

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        var name = (value as string)?.Trim();

        if (string.IsNullOrEmpty(name))
        {
            return new ValidationResult("Full name must not be empty.");
        }

        if (name.Length < minLength || name.Length > maxLength)
        {
            return new ValidationResult($"Full name must be between {minLength} and {maxLength} characters.");
        }

        if (!NamePattern.IsMatch(name))
        {
            return new ValidationResult("Full name may only contain letters, spaces, hyphens, apostrophes, or periods.");
        }

        return ValidationResult.Success;
    }
}

public sealed class PhoneNumberAttribute : ValidationAttribute
{
    private static readonly Regex PhonePattern = new(
        @"^(0|\+84)(3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-46-9])\d{7}$",
        RegexOptions.Compiled);

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not string phone || string.IsNullOrWhiteSpace(phone))
        {
            return ValidationResult.Success;
        }

        return PhonePattern.IsMatch(phone.Trim())
            ? ValidationResult.Success
            : new ValidationResult("Invalid phone number format (e.g. 0912345678 or +84912345678).");
    }
}
