namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Loại phòng/sân (BR-108). Room trỏ tới đây; SportRoomType cho biết môn nào chơi được ở loại nào.</summary>
public class RoomType
{
    public int RoomTypeId { get; set; }

    public string Name { get; set; } = string.Empty; // unique không phân biệt hoa/thường
}
