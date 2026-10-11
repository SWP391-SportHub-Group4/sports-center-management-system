namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Giá thuê sân theo loại sân (và tùy chọn môn) + khung giờ (BR-127). Chống chồng lấn kiểm ở service.</summary>
public class CourtRate
{
    public int RateId { get; set; }

    public int RoomTypeId { get; set; }

    /// <summary>Null = áp dụng mọi môn chơi được ở loại sân này.</summary>
    public int? SportId { get; set; }

    /// <summary>Chuỗi như "MON,TUE,SAT".</summary>
    public string DaysOfWeek { get; set; } = string.Empty;

    public TimeOnly StartTimeLocal { get; set; }

    public TimeOnly EndTimeLocal { get; set; }

    /// <summary>VND, dương và bội số 1.000 (BR-113).</summary>
    public decimal PricePerHour { get; set; }

    public bool IsActive { get; set; } = true;
}
