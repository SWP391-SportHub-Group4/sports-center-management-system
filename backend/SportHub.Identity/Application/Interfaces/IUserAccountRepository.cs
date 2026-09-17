namespace SportHub.Identity.Application.Interfaces;

public interface IUserAccountRepository
{
    Task<bool> EmailExistsAsync(
        string email,
        CancellationToken cancellationToken = default);

    Task<bool> PhoneExistsAsync(
        string phone,
        CancellationToken cancellationToken = default);

    Task<Role> GetRoleAsync(
        UserRole roleName,
        CancellationToken cancellationToken = default);

    Task AddAndSaveAsync(
        UserAccount account,
        CancellationToken cancellationToken = default);

    Task<UserAccount?> FindByEmailForLoginAsync(
        string email,
        CancellationToken cancellationToken = default);
}
