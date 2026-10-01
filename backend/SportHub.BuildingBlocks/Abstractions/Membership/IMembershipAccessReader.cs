namespace SportHub.BuildingBlocks.Abstractions.Membership;

/// <summary>
/// Membership hiện có của hội viên; dùng cho Gym và điều kiện mua PT (không dùng cho ghi danh lớp).
/// Bản cài đặt ở Membership.
/// </summary>
public interface IMembershipAccessReader
{
    /// <summary>Gói còn hiệu lực tại <paramref name="atUtc"/>; null nếu không có.</summary>
    Task<MembershipAccess?> GetActiveAsync(Guid memberId, DateTimeOffset atUtc, CancellationToken cancellationToken = default);
    Task<MembershipDetails?> GetByIdAsync(Guid memberPackageId, CancellationToken cancellationToken = default);
}

/// <param name="StartDate">Ngày theo giờ Việt Nam.</param>
public sealed record MembershipAccess(Guid MemberPackageId, int PackageId, DateOnly StartDate, DateOnly EndDate);
public sealed record MembershipDetails(Guid MemberPackageId, Guid MemberId, int PackageId,
    DateOnly StartDate, DateOnly EndDate, string Status);
