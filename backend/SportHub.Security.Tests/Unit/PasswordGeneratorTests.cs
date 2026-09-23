using SportHub.Identity.Infrastructure.Security;

namespace SportHub.Security.Tests.Unit;

public class PasswordGeneratorTests
{
    [Fact]
    public void Generates_14_chars_with_all_four_groups_every_time()
    {
        var generator = new PasswordGenerator();

        for (var i = 0; i < 500; i++)
        {
            var password = generator.GenerateStrong();

            Assert.Equal(PasswordGenerator.Length, password.Length);
            Assert.Contains(password, char.IsUpper);
            Assert.Contains(password, char.IsLower);
            Assert.Contains(password, char.IsDigit);
            Assert.Contains(password, c => !char.IsLetterOrDigit(c));
        }
    }

    [Fact]
    public void Does_not_repeat()
    {
        var generator = new PasswordGenerator();
        var seen = Enumerable.Range(0, 1000).Select(_ => generator.GenerateStrong()).ToHashSet();

        Assert.Equal(1000, seen.Count);
    }
}
