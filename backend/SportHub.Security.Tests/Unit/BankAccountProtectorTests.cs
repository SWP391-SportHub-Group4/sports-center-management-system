using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Infrastructure.Security;

namespace SportHub.Security.Tests.Unit;

public sealed class BankAccountProtectorTests
{
    [Fact]
    public void ProtectsAndRecoversAccountNumberWithoutExposingItInTheCiphertext()
    {
        var services = new ServiceCollection().AddDataProtection().Services.BuildServiceProvider();
        var protector = new BankAccountProtector(services.GetRequiredService<IDataProtectionProvider>());
        const string account = "012345678901";

        var encrypted = protector.Protect(account);

        Assert.NotEqual(account, encrypted);
        Assert.DoesNotContain(account, encrypted);
        Assert.Equal(account, protector.Unprotect(encrypted));
        Assert.Equal("8901", BankAccountProtector.LastFour(account));
        Assert.Equal("••••8901", BankAccountProtector.Mask("8901"));
    }

    [Theory]
    [InlineData("123")]
    [InlineData("12 3456")]
    [InlineData("1234/5678")]
    public void RejectsMalformedAccountNumbers(string account)
    {
        var services = new ServiceCollection().AddDataProtection().Services.BuildServiceProvider();
        var protector = new BankAccountProtector(services.GetRequiredService<IDataProtectionProvider>());
        Assert.Throws<ArgumentException>(() => protector.Protect(account));
    }
}
