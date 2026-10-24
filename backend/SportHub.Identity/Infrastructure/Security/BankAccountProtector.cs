using Microsoft.AspNetCore.DataProtection;

namespace SportHub.Identity.Infrastructure.Security;

/// <summary>Encrypts payout bank account numbers using the application's persistent Data Protection key ring.</summary>
public sealed class BankAccountProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("SportHub.SupportPayout.BankAccount.v1");

    public string Protect(string accountNumber)
    {
        var value = accountNumber.Trim();
        if (value.Length < 4 || value.Length > 64 || !value.All(char.IsAsciiLetterOrDigit))
            throw new ArgumentException("Enter a valid bank account number.", nameof(accountNumber));
        return _protector.Protect(value);
    }

    public string Unprotect(string encrypted) => _protector.Unprotect(encrypted);

    public static string LastFour(string accountNumber)
    {
        var value = accountNumber.Trim();
        if (value.Length < 4) throw new ArgumentException("Enter a valid bank account number.", nameof(accountNumber));
        return value[^4..];
    }

    public static string Mask(string lastFour) => $"••••{lastFour}";
}
