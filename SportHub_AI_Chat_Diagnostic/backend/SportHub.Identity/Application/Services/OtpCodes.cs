using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace SportHub.Identity.Application.Services;

/// <summary>Sinh và băm mã OTP 6 số dùng chung cho đăng ký Member. Quên mật khẩu dùng link, không dùng mã.</summary>
public static class OtpCodes
{
    public static string Generate()
        => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);

    /// <summary>Token ngẫu nhiên 256-bit (base64url) cho link đặt lại mật khẩu; chỉ lưu bản băm SHA-256.</summary>
    public static string GenerateLinkToken()
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>SHA-256 hex. Mã 6 số chỉ có 10^6 khả năng nên lớp chặn thật là hạn 10 phút + 5 lần thử + rate limit.</summary>
    public static string Hash(string code)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code)));

    public static bool Matches(string code, string storedHash)
        => CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(storedHash),
            Encoding.ASCII.GetBytes(Hash(code)));
}
