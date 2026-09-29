using SportHub.Identity.Domain.Rules;
using SportHub.Identity.Infrastructure.Security;

namespace SportHub.Security.Tests.Unit;

public class PasswordPolicyTests
{
    [Theory]
    [InlineData("Abcdef1!", null)]                       // đúng 8 ký tự
    [InlineData("Correct-Horse-9", "user@example.com")]
    [InlineData("Mật-khẩu-Mạnh-2!", "user@example.com")] // Unicode
    public void Valid_passwords_pass(string password, string? email)
        => Assert.Null(PasswordPolicy.Validate(password, email));

    [Fact]
    public void Too_short_is_rejected()
        => Assert.Equal(PasswordPolicy.TooShort, PasswordPolicy.Validate("Ab1!xyz", null));

    [Fact]
    public void Length_boundaries_are_8_and_64_characters()
    {
        var sixtyFour = "Aa1!" + new string('x', 60);
        var sixtyFive = sixtyFour + "x";

        Assert.Null(PasswordPolicy.Validate(sixtyFour, null));
        Assert.Equal(PasswordPolicy.TooLong, PasswordPolicy.Validate(sixtyFive, null));
    }

    [Theory]
    [InlineData("abcdefg1!")]  // thiếu HOA
    [InlineData("ABCDEFG1!")]  // thiếu thường
    [InlineData("Abcdefgh!")]  // thiếu số
    [InlineData("Abcdefgh1")]  // thiếu ký tự đặc biệt
    public void Missing_a_group_is_rejected(string password)
        => Assert.Equal(PasswordPolicy.MissingGroups, PasswordPolicy.Validate(password, null));

    [Theory]
    [InlineData("Nguyen.Van@example.com", "xxNGUYEN.VANxx1!a")]
    [InlineData("tranb@example.com", "Tranb-Strong-9")]
    public void Password_containing_email_local_part_is_rejected_case_insensitively(string email, string password)
        => Assert.Equal(PasswordPolicy.ContainsEmailLocalPart, PasswordPolicy.Validate(password, email));
}

public class PasswordHasherV2Tests
{
    private readonly PasswordHasher _hasher = new();

    [Fact]
    public void Password_beyond_72_bytes_uses_every_character()
    {
        // 60 ký tự é = 120 byte UTF-8. BCrypt thuần cắt ở 72 byte nên hai mật khẩu khác đuôi sẽ trùng hash.
        var a = new string('é', 60) + "A1!";
        var b = new string('é', 60) + "B2?";

        var hash = _hasher.Hash(a);

        Assert.True(_hasher.Verify(a, hash));
        Assert.False(_hasher.Verify(b, hash));
    }

    [Fact]
    public void New_hashes_do_not_need_rehash_and_legacy_bcrypt_still_verifies()
    {
        Assert.False(_hasher.NeedsRehash(_hasher.Hash("Abcdef1!")));

        var legacy = BCrypt.Net.BCrypt.HashPassword("Legacy-Pass-1!");

        Assert.True(_hasher.NeedsRehash(legacy));
        Assert.True(_hasher.Verify("Legacy-Pass-1!", legacy));
        Assert.False(_hasher.Verify("Legacy-Pass-2!", legacy));
    }
}
