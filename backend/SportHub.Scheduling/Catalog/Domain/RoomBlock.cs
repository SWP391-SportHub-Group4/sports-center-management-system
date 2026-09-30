namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Khung giờ khóa phòng (bảo trì, sự kiện, sự cố). Chiếm chỗ qua RoomOccupancy khi đợt migration occupancy có mặt.</summary>
public class RoomBlock
{
    public Guid BlockId { get; set; }

    public int RoomId { get; set; }

    public DateTime StartAtUtc { get; set; }

    public DateTime EndAtUtc { get; set; }

    public string Reason { get; set; } = string.Empty;

    /// <summary>Sự cố gây ra block (bảng IncidentNotice thêm ở đợt migration Rental); chưa có FK.</summary>
    public Guid? IncidentId { get; set; }

    public Guid CreatedByUserId { get; set; }
}
