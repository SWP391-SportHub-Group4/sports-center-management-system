namespace SportHub.BuildingBlocks.Abstractions.Identity;

/// <summary>Trạng thái và môn của ExternalCoach, dùng để quyết định được thuê sân hay không. Bản cài đặt ở Identity.</summary>
public interface IExternalCoachAccessReader
{
    Task<ExternalCoachAccess?> GetAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Approved + tài khoản Active + có môn <paramref name="sportId"/> trong hồ sơ.</summary>
    Task<bool> CanRentForSportAsync(Guid userId, int sportId, CancellationToken cancellationToken = default);
}

/// <param name="ApprovalStatus">PendingApproval / Approved / Rejected / Suspended.</param>
public sealed record ExternalCoachAccess(
    Guid UserId,
    string ApprovalStatus,
    bool IsAccountActive,
    IReadOnlyList<int> SportIds);
