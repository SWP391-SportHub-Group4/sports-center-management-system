using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Infrastructure.Security;

public sealed class PasswordHasher : IPasswordHasher
{
    /// <summary>
    /// Hash giả cố định cho <see cref="VerifyDummy"/>. Tạo sẵn bằng chính BCrypt.Net-Next
    /// 4.2.0 mà project tham chiếu, ở đúng work factor mặc định của <see cref="Hash"/> —
    /// đã xác minh bằng runtime: <c>HashPassword(...)</c> sinh prefix <c>$2a$11$</c> (cost 11),
    /// nên verify trên hash này tốn đúng lượng công như verify một hash thật.
    /// Đây KHÔNG phải credential của user và không phải secret: plaintext của nó là chuỗi
    /// đánh dấu cố định, và kết quả verify luôn bị bỏ đi.
    /// Nếu sau này đổi work factor của <see cref="Hash"/>, PHẢI tạo lại hằng số này cùng lúc,
    /// nếu không hai nhánh login sẽ lại lệch nhau về thời gian.
    /// </summary>
    private const string DummyHash = "$2a$11$3SnJIygLfnbgoBM4JCCINe0JqfIzGcYQbrxvLOBhIWXT8crK3N.ou";

    public string Hash(string password)
        => BCrypt.Net.BCrypt.HashPassword(password);

    public bool Verify(string password, string hash)
        => BCrypt.Net.BCrypt.Verify(password, hash);

    public void VerifyDummy(string password)
        => _ = BCrypt.Net.BCrypt.Verify(password, DummyHash);
}
