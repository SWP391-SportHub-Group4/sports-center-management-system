namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Giữ/nhả chỗ phòng và coach theo khoảng [start, end). Bản cài đặt ở Scheduling/Occupancy.
///
/// Dùng chung DbContext và transaction của caller: không tự mở transaction lồng, không tự
/// SaveChanges/commit. Xung đột do DB exclusion constraint chặn thật; kết quả ở đây chỉ để
/// caller trả 409 có danh sách xung đột thay vì lộ lỗi SQL.
/// </summary>
public interface IOccupancyService
{
    Task<OccupancyResult> ReserveAsync(OccupancyRequest request, CancellationToken cancellationToken = default);

    /// <summary>Đổi giờ/phòng/coach của cùng nguồn; lỗi thì lịch cũ giữ nguyên.</summary>
    Task<OccupancyResult> ReplaceAsync(OccupancyRequest request, CancellationToken cancellationToken = default);

    Task ReleaseAsync(string sourceType, Guid sourceId, CancellationToken cancellationToken = default);
}

public static class OccupancySources
{
    public const string ClassSession = nameof(ClassSession);
    public const string PtSession = nameof(PtSession);
    public const string CourtRental = nameof(CourtRental);
    public const string RoomBlock = nameof(RoomBlock);
}

/// <param name="RoomId">Null khi chỉ chiếm coach (PT chưa gắn phòng).</param>
/// <param name="CoachId">Null khi chỉ chiếm phòng (block).</param>
public sealed record OccupancyRequest(
    string SourceType,
    Guid SourceId,
    int? RoomId,
    Guid? CoachId,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc);

public sealed record OccupancyConflict(
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Resource,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ConflictSourceType,
    Guid ConflictSourceId, DateTimeOffset StartUtc, DateTimeOffset EndUtc);

public sealed record OccupancyResult(bool Succeeded, IReadOnlyList<OccupancyConflict> Conflicts)
{
    public static OccupancyResult Ok { get; } = new(true, []);
}
