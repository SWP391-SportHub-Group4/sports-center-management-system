namespace SportHub.Scheduling.Occupancy.Domain;

// Nguồn chiếm chỗ phòng/coach. Lưu int; chỉ được append.
public enum OccupancySourceType
{
    ClassSession,
    PtSession, // ngừng dùng; giữ để không đổi số lưu của các nguồn sau
    CourtRental,
    RoomBlock
}
