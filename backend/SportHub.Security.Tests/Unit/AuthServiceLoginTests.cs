using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Security.Tests.Unit;

public class AuthServiceLoginTests
{
    private static IOptions<JwtOptions> JwtOptions() => Options.Create(new JwtOptions
    {
        Issuer = "sporthub-tests",
        Audience = "sporthub-tests",
        SecretKey = "test-secret-key-for-unit-tests-32-chars-min",
        AccessTokenExpiryMinutes = 60
    });

    private static UserAccount NewUser(
        UserCredential? credential,
        UserStatus status = UserStatus.Active,
        UserRole role = UserRole.Member)
        => new()
        {
            UserId = Guid.NewGuid(),
            Email = "user@example.com",
            RoleId = 1,
            Role = new Role { RoleId = 1, RoleName = role },
            Status = status,
            Credential = credential,
            Profile = new UserProfile { FullName = "Nguyen Van A" }
        };

    private static AuthService Service(UserAccount? user, CountingPasswordHasher hasher)
        // LoginAsync khong cham db/email (chi dung cho OTP Register) nen de null o day.
        => new(new StubUserAccountRepository(user), hasher, JwtOptions(), null!, null!, new SystemClock());

    private static LoginRequest Request(string password = "CorrectHorse1") => new()
    {
        Email = "user@example.com",
        Password = password
    };

    private const string RealHash = "$2a$11$abcdefghijklmnopqrstuv";

    // --- Nhanh khong co hash that: dung 1 VerifyDummy, 0 Verify that ---

    public static TheoryData<string> NoRealHashCaseNames() =>
    [
        "user-null",
        "credential-null",
        "hash-null",
        "hash-empty"
    ];

    private static UserAccount? BuildNoRealHashCase(string caseName) => caseName switch
    {
        "user-null" => null,
        "credential-null" => NewUser(credential: null),
        "hash-null" => NewUser(new UserCredential { PasswordHash = null }),
        "hash-empty" => NewUser(new UserCredential { PasswordHash = string.Empty }),
        _ => throw new ArgumentOutOfRangeException(nameof(caseName), caseName, null)
    };

    [Theory]
    [MemberData(nameof(NoRealHashCaseNames))]
    public async Task No_real_hash_runs_exactly_one_dummy_verify(string caseName)
    {
        var hasher = new CountingPasswordHasher();
        var service = Service(BuildNoRealHashCase(caseName), hasher);

        await Assert.ThrowsAsync<InvalidCredentialsException>(() => service.LoginAsync(Request()));

        Assert.Equal(1, hasher.VerifyDummyCalls);
        Assert.Equal(0, hasher.VerifyCalls);
    }

    [Fact]
    public async Task Wrong_password_runs_exactly_one_real_verify_and_no_dummy()
    {
        var hasher = new CountingPasswordHasher(verifyResult: false);
        var service = Service(NewUser(new UserCredential { PasswordHash = RealHash }), hasher);

        await Assert.ThrowsAsync<InvalidCredentialsException>(() => service.LoginAsync(Request()));

        Assert.Equal(1, hasher.VerifyCalls);
        Assert.Equal(0, hasher.VerifyDummyCalls);
    }

    [Fact]
    public async Task All_three_failure_branches_share_one_message()
    {
        var messages = new List<string>();

        UserAccount?[] users =
        [
            null,
            NewUser(credential: null),
            NewUser(new UserCredential { PasswordHash = RealHash })
        ];

        foreach (var user in users)
        {
            var ex = await Assert.ThrowsAsync<InvalidCredentialsException>(
                () => Service(user, new CountingPasswordHasher(verifyResult: false)).LoginAsync(Request()));

            messages.Add(ex.Message);
        }

        Assert.Single(messages.Distinct());
    }

    // --- Trang thai tai khoan chi lo SAU khi password da dung ---

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task Blocked_account_with_wrong_password_still_returns_invalid_credentials(UserStatus status)
    {
        var hasher = new CountingPasswordHasher(verifyResult: false);
        var user = NewUser(new UserCredential { PasswordHash = RealHash }, status);

        await Assert.ThrowsAsync<InvalidCredentialsException>(() => Service(user, hasher).LoginAsync(Request()));
    }

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task Blocked_account_with_correct_password_returns_account_blocked(UserStatus status)
    {
        var hasher = new CountingPasswordHasher(verifyResult: true);
        var user = NewUser(new UserCredential { PasswordHash = RealHash }, status);

        var ex = await Assert.ThrowsAsync<AccountBlockedException>(
            () => Service(user, hasher).LoginAsync(Request()));

        Assert.Equal(status, ex.Status);
    }

    // --- Happy path giu nguyen hop dong response ---

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Successful_login_returns_token_and_user_info(UserRole role)
    {
        var hasher = new CountingPasswordHasher(verifyResult: true);
        var user = NewUser(new UserCredential { PasswordHash = RealHash }, role: role);

        var result = await Service(user, hasher).LoginAsync(Request());

        Assert.False(string.IsNullOrWhiteSpace(result.AccessToken));
        Assert.Equal(user.UserId, result.User.UserId);
        Assert.Equal("user@example.com", result.User.Email);
        Assert.Equal("Nguyen Van A", result.User.FullName);
        Assert.Equal(role.ToString(), result.User.Role);
        Assert.Equal(1, hasher.VerifyCalls);
        Assert.Equal(0, hasher.VerifyDummyCalls);
    }

    // --- Password phai duoc truyen nguyen ven, ke ca khoang trang ---

    [Theory]
    [InlineData("  leading and trailing  ")]
    [InlineData("tab\there")]
    [InlineData(" ")]
    public async Task Password_is_passed_through_untouched(string password)
    {
        var hasher = new CountingPasswordHasher(verifyResult: true);
        var user = NewUser(new UserCredential { PasswordHash = RealHash });

        await Service(user, hasher).LoginAsync(Request(password));

        Assert.Equal(password, Assert.Single(hasher.PasswordsSeen));
    }

    [Fact]
    public async Task Password_is_passed_through_untouched_on_dummy_branch()
    {
        var hasher = new CountingPasswordHasher();

        await Assert.ThrowsAsync<InvalidCredentialsException>(
            () => Service(null, hasher).LoginAsync(Request("  spaced  ")));

        Assert.Equal("  spaced  ", Assert.Single(hasher.PasswordsSeen));
    }

    [Fact]
    public async Task Email_is_trimmed_because_EmailAddress_attribute_accepts_padding()
    {
        // [EmailAddress] cua ASP.NET Core KHONG loai email co khoang trang dau/cuoi,
        // nen Trim trong LoginAsync la dong load-bearing: thieu no thi request hop le
        // nhung co padding se tim nham user va tra 401 cho tai khoan thuc ra ton tai.
        Assert.True(new EmailAddressAttribute().IsValid(" user@example.com "));

        var hasher = new CountingPasswordHasher(verifyResult: true);
        var user = NewUser(new UserCredential { PasswordHash = RealHash });

        var result = await Service(user, hasher).LoginAsync(new LoginRequest
        {
            Email = "  user@example.com  ",
            Password = "CorrectHorse1"
        });

        Assert.Equal("user@example.com", result.User.Email);
    }
}
