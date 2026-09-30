using System.Security.Cryptography;
using System.Text;

namespace SportHub.Identity.Infrastructure.Security;

public static class GoogleOnboardingTokenService
{
    public static readonly TimeSpan TicketLifetime = TimeSpan.FromMinutes(10);

    /// <summary>Sinh opaque token 256-bit (CSPRNG) — chỉ trả ra client đúng một lần.</summary>
    public static string GenerateRawToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    public static string HashToken(string rawToken)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}
