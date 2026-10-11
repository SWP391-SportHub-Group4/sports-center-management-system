namespace SportHub.Identity.Application.Interfaces;

/// <summary>Trạng thái xác thực hiện tại của một user, đọc từ DB ở mỗi request đã xác thực.</summary>
public sealed record UserAuthState(UserStatus Status, string Role, Guid SecurityStamp);

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
    
    Task<UserAuthState?> GetAuthStateAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<bool> IsActiveAsync(
        Guid userId,
        CancellationToken cancellationToken = default);
}
