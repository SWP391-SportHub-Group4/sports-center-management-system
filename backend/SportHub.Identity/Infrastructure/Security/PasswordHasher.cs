using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Infrastructure.Security;

/// <summary>
/// Hash mới có tiền tố "v2$" và là BCrypt với enhancedEntropy (SHA-384 + base64 trước khi vào
/// BCrypt) nên không cắt ở 72 byte — mật khẩu Unicode dài tới 64 ký tự vẫn dùng đủ. Hash cũ (không có tiền tố,
/// BCrypt thuần) vẫn verify được; <see cref="NeedsRehash"/> báo để caller băm lại khi login thành công.
/// </summary>
public sealed class PasswordHasher : IPasswordHasher
{
    private const string Version2Prefix = "v2$";
    private const int WorkFactor = 11;

    /// <summary>
    /// Hash giả cố định cho <see cref="VerifyDummy"/>, BCrypt cost 11 = đúng work factor của
    /// <see cref="Hash"/>, nên verify trên nó tốn đúng lượng công như verify một hash thật. Không phải
    /// credential của user; kết quả verify luôn bị bỏ đi. Đổi <see cref="WorkFactor"/> thì PHẢI tạo lại hằng số này.
    /// </summary>
    private const string DummyHash = "$2a$11$3SnJIygLfnbgoBM4JCCINe0JqfIzGcYQbrxvLOBhIWXT8crK3N.ou";

    public string Hash(string password)
        => Version2Prefix + BCrypt.Net.BCrypt.HashPassword(password, WorkFactor, enhancedEntropy: true);

    public bool Verify(string password, string hash)
        => hash.StartsWith(Version2Prefix, StringComparison.Ordinal)
            ? BCrypt.Net.BCrypt.Verify(password, hash[Version2Prefix.Length..], enhancedEntropy: true)
            : BCrypt.Net.BCrypt.Verify(password, hash);

    public bool NeedsRehash(string hash)
        => !hash.StartsWith(Version2Prefix, StringComparison.Ordinal);

    public void VerifyDummy(string password)
        => _ = BCrypt.Net.BCrypt.Verify(password, DummyHash, enhancedEntropy: true);
}
