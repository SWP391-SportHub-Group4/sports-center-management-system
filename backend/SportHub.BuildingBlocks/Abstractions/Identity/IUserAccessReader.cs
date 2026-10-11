namespace SportHub.BuildingBlocks.Abstractions.Identity;

/// <summary>
/// Đọc tối thiểu về một tài khoản cho module khác (role, trạng thái, email). Bản cài đặt ở Identity.
/// Chỉ đọc; không trả entity và không trả dữ liệu ngoài mức các module khác cần.
/// </summary>
public interface IUserAccessReader
{
    Task<UserAccessInfo?> GetAsync(Guid userId, CancellationToken cancellationToken = default);
}

/// <param name="Role">Tên role như trong JWT (<see cref="Api.SportHubRoleNames"/>).</param>
/// <param name="IsActive">Tài khoản đang Active (chưa Banned/Deactivated).</param>
public sealed record UserAccessInfo(Guid UserId, string Role, bool IsActive, string Email, string FullName);
