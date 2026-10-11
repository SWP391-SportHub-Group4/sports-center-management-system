namespace SportHub.Scheduling.Occupancy.Domain;

// Nguồn chiếm chỗ phòng/coach. Lưu int; chỉ được append.
public enum OccupancySourceType
{
    ClassSession,
    PtSession,
    CourtRental,
    RoomBlock
}
