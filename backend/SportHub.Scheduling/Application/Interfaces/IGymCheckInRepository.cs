namespace SportHub.Scheduling.Application.Interfaces;

public interface IGymCheckInRepository
{
    /// <summary>
    /// Kiểm tra BR-64 rồi ghi check-in trong CÙNG một transaction, có khóa dòng
    /// member_packages để check-then-insert không bị race với đường cập nhật gói.
    /// Ném MemberNotFoundException / NoActiveMemberPackageException nếu không thỏa.
    /// </summary>
    Task CreateGuardedAsync(
        GymCheckIn checkIn,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<GymCheckIn> Items, int TotalCount)> GetHistoryAsync(
        Guid memberId,
        int skip,
        int take,
        CancellationToken cancellationToken = default);
}
