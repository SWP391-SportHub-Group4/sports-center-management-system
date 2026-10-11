namespace SportHub.Scheduling.Occupancy.Domain;

/// <summary>
/// Một khoảng [StartAtUtc, EndAtUtc) phòng bị chiếm bởi một nguồn (buổi lớp, PT, thuê sân, block).
/// Chống trùng do DB: exclusion constraint (room_id, tstzrange) chỉ với dòng IsActive. Hai khoảng liền kề không xung đột.
/// Mỗi nguồn đúng một dòng (unique source_type + source_id); nhả chỗ = IsActive=false, đặt lại thì dùng lại dòng.
/// </summary>
public class RoomOccupancy
{
    public Guid OccupancyId { get; set; }

    public int RoomId { get; set; }

    public OccupancySourceType SourceType { get; set; }

    public Guid SourceId { get; set; }

    public DateTime StartAtUtc { get; set; }

    public DateTime EndAtUtc { get; set; }

    public bool IsActive { get; set; } = true;
}
