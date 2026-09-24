using System.Security.Cryptography;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Infrastructure.Security;

/// <summary>
/// Mật khẩu gợi ý cho tài khoản Google mới. Chỉ trả cho FE, KHÔNG hash/lưu vào
/// UserCredential — BR-60, mật khẩu thật chỉ đặt qua POST /api/users/me/password.
/// </summary>
public sealed class PasswordGenerator : IPasswordGenerator
{
    public const int Length = 14;

    // Bỏ ký tự dễ nhầm (0/O, 1/l/I) vì người dùng có thể phải gõ lại bằng tay.
    private const string Upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Lower = "abcdefghijkmnopqrstuvwxyz";
    private const string Digits = "23456789";
    private const string Special = "!@#$%^&*-_=+?";
    private const string All = Upper + Lower + Digits + Special;

    public string GenerateStrong()
    {
        var chars = new char[Length];

        // Mỗi nhóm có ít nhất 1 ký tự, phần còn lại lấy từ toàn bộ bảng.
        chars[0] = Pick(Upper);
        chars[1] = Pick(Lower);
        chars[2] = Pick(Digits);
        chars[3] = Pick(Special);

        for (var i = 4; i < Length; i++)
        {
            chars[i] = Pick(All);
        }

        // Xáo lại để 4 ký tự bắt buộc không luôn nằm ở đầu chuỗi.
        RandomNumberGenerator.Shuffle(chars.AsSpan());

        return new string(chars);
    }

    private static char Pick(string alphabet) => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
}
