using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace SportHub.Payment.VnPay;

/// <summary>PAY v2.1.0 canonical form: ordinal key order, form-url-encoded values, HMAC-SHA512.</summary>
public static class VnPaySigner
{
    public static string Canonicalize(IEnumerable<KeyValuePair<string, string>> values)
        => string.Join("&", values.Where(x => x.Key.StartsWith("vnp_", StringComparison.Ordinal)
                && x.Key is not ("vnp_SecureHash" or "vnp_SecureHashType") && !string.IsNullOrEmpty(x.Value))
            .OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => $"{WebUtility.UrlEncode(x.Key)}={WebUtility.UrlEncode(x.Value)}"));

    public static string Sign(string canonical, string secret)
        => Convert.ToHexString(HMACSHA512.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(canonical)))
            .ToLowerInvariant();

    public static bool Verify(IEnumerable<KeyValuePair<string, string>> values, string secret)
    {
        var pairs = values.ToArray();
        var received = pairs.FirstOrDefault(x => x.Key == "vnp_SecureHash").Value;
        if (received is null || received.Length != 128 || !received.All(Uri.IsHexDigit))
            return false;
        return CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(received), Convert.FromHexString(Sign(Canonicalize(pairs), secret)));
    }
}
