namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Giờ mở cửa của phòng theo thứ (BR-109), giờ địa phương Asia/Ho_Chi_Minh. Mỗi phòng tối đa một khoảng mỗi ngày.</summary>
public class RoomOpeningHour
{
    public int RoomId { get; set; }

    /// <summary>0 = Chủ nhật … 6 = Thứ bảy (theo System.DayOfWeek).</summary>
    public int DayOfWeek { get; set; }

    public TimeOnly OpenTimeLocal { get; set; }

    public TimeOnly CloseTimeLocal { get; set; }
}
