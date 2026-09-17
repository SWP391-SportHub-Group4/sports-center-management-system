using System.Text;
using SportHub.Identity.Infrastructure.Security;

namespace SportHub.Security.Tests.Unit;

/// <summary>
/// Chot rang dummy hash nhung trong PasswordHasher thuc su hop le va dung cost voi
/// hash that. Neu ai do doi work factor cua Hash ma quen tao lai dummy hash, test nay fail.
/// </summary>
public class PasswordHasherTests
{
    private readonly PasswordHasher _hasher = new();

    private static int WorkFactorOf(string hash)
    {
        // Dinh dang bcrypt: $2a$<cost>$<salt+hash>
        var parts = hash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        return int.Parse(parts[1]);
    }

    [Fact]
    public void VerifyDummy_uses_same_work_factor_as_Hash()
    {
        var realHash = _hasher.Hash("SomeRealPassword1");
        var realCost = WorkFactorOf(realHash);

        // Doc lai hang so dummy qua reflection: no la private const, khong phai API cong khai.
        var dummyHash = (string)typeof(PasswordHasher)
            .GetField("DummyHash", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
            .GetRawConstantValue()!;

        Assert.StartsWith("$2a$", dummyHash);
        Assert.Equal(60, dummyHash.Length);
        Assert.Equal(realCost, WorkFactorOf(dummyHash));
    }

    [Fact]
    public void VerifyDummy_never_throws_for_passwords_up_to_72_bytes()
    {
        // LoginRequest gioi han 72 byte UTF-8, nen day la bien tren thuc te cua input.
        var ascii72 = new string('a', 72);
        var multiByte = new string('é', 36); // 2 byte/ky tu => dung 72 byte

        Assert.Equal(72, Encoding.UTF8.GetByteCount(ascii72));
        Assert.Equal(72, Encoding.UTF8.GetByteCount(multiByte));

        _hasher.VerifyDummy(ascii72);
        _hasher.VerifyDummy(multiByte);
        _hasher.VerifyDummy(string.Empty);
        _hasher.VerifyDummy("   ");
    }

    [Fact]
    public void VerifyDummy_cannot_be_used_to_authenticate()
    {
        // Hop dong cua API: VerifyDummy khong tra ket qua nao ca.
        var method = typeof(PasswordHasher).GetMethod(nameof(PasswordHasher.VerifyDummy))!;

        Assert.Equal(typeof(void), method.ReturnType);
    }

    [Fact]
    public void Hash_and_Verify_still_round_trip()
    {
        var hash = _hasher.Hash("CorrectHorse1");

        Assert.True(_hasher.Verify("CorrectHorse1", hash));
        Assert.False(_hasher.Verify("WrongHorse1", hash));
    }
}
