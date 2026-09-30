namespace SportHub.Scheduling.Occupancy.Domain;

/// <summary>
/// Khoảng [StartAtUtc, EndAtUtc) một coach (nội bộ hoặc ngoài) bị chiếm, bất kể phòng nào.
/// Cùng quy tắc với <see cref="RoomOccupancy"/>: exclusion constraint theo coach_id, unique theo nguồn.
/// </summary>
public class CoachOccupancy
{
    public Guid OccupancyId { get; set; }

    public Guid CoachId { get; set; }

    public OccupancySourceType SourceType { get; set; }

    public Guid SourceId { get; set; }

    public DateTime StartAtUtc { get; set; }

    public DateTime EndAtUtc { get; set; }

    public bool IsActive { get; set; } = true;
}
