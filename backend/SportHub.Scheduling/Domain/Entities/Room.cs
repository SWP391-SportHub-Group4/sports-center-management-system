namespace SportHub.Scheduling.Domain.Entities;

public class Room
{
    public int RoomId { get; set; } // PK

    public string Name { get; set; } = string.Empty; // unique toàn trung tâm

    public int Capacity { get; set; } // trần sức chứa vật lý

    public int? RoomTypeId { get; set; } // FK -> RoomType; null cho phòng cũ chưa phân loại

    public bool IsActive { get; set; } = true; // ngừng dùng thay cho xóa cứng

}
