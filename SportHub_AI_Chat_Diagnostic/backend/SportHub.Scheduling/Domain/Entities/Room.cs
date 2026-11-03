namespace SportHub.Scheduling.Domain.Entities;

public class Room
{
    public int RoomId { get; set; } // PK

    public string Name { get; set; } = string.Empty; // unique toàn trung tâm

    public int Capacity { get; set; } // trần sức chứa vật lý

    public int? SportId { get; set; } // Legacy metadata only; rooms can host classes for any sport.

    public bool AllowRental { get; set; } // Explicit manager opt-in; independent of class scheduling.

    public int? RoomTypeId { get; set; } // FK -> RoomType; null cho phòng cũ chưa phân loại

    /// <summary>New courts accept member bookings starting the next Vietnam calendar day; null for legacy rooms.</summary>
    public DateTime? RentalBookingOpensAtUtc { get; set; }

    public bool IsActive { get; set; } = true; // ngừng dùng thay cho xóa cứng

}
