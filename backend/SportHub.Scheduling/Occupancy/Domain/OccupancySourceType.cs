namespace SportHub.Scheduling.Occupancy.Domain;

// Nguồn chiếm chỗ phòng/coach. Lưu int; chỉ được append.
public enum OccupancySourceType
{
    ClassSession,
    ReservedLegacySource = 1, // giữ ordinal của dữ liệu cũ
    CourtRental,
    RoomBlock
}
