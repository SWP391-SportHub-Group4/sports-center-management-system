using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Unit;

/// <summary>
/// Dem so lan Verify that / VerifyDummy va giu lai password duoc truyen vao,
/// de chot "moi login hop le ve DTO ton dung mot phep BCrypt".
/// </summary>
public sealed class CountingPasswordHasher(bool verifyResult = false) : IPasswordHasher
{
    public int VerifyCalls { get; private set; }

    public int VerifyDummyCalls { get; private set; }

    public List<string> PasswordsSeen { get; } = [];

    public string Hash(string password) => $"hashed::{password}";

    public bool Verify(string password, string hash)
    {
        VerifyCalls++;
        PasswordsSeen.Add(password);
        return verifyResult;
    }

    public void VerifyDummy(string password)
    {
        VerifyDummyCalls++;
        PasswordsSeen.Add(password);
    }
}

public sealed class StubUserAccountRepository(UserAccount? user) : IUserAccountRepository
{
    public Task<UserAccount?> FindByEmailForLoginAsync(string email, CancellationToken cancellationToken = default)
        => Task.FromResult(user);

    public Task<bool> IsActiveAsync(Guid userId, CancellationToken cancellationToken = default)
        => Task.FromResult(user is { Status: UserStatus.Active });

    public Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken = default)
        => Task.FromResult(false);

    public Task<bool> PhoneExistsAsync(string phone, CancellationToken cancellationToken = default)
        => Task.FromResult(false);

    public Task<Role> GetRoleAsync(UserRole roleName, CancellationToken cancellationToken = default)
        => Task.FromResult(new Role { RoleId = 1, RoleName = roleName });

    public Task AddAndSaveAsync(UserAccount account, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
