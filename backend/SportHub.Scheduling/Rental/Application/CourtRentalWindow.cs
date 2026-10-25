using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>
/// BR-126/BR-128: cửa sổ thuê sân áp dụng cho Member tự thuê và Receptionist đặt hộ. Chỉ thuê trong khung
/// 06:00 đến 22:00 giờ Việt Nam; chỉ hiển thị và đặt trong hôm nay + 2 ngày, cửa sổ đổi ngày lúc 06:00 (không phải 00:00).
/// </summary>
public static class CourtRentalWindow
{
    public const int DaysAhead = 2;
    public const int OpenMinute = 6 * 60;
    public const int CloseMinute = 22 * 60;

    /// <summary>Ngày neo của cửa sổ: trước 06:00 vẫn thuộc ngày hôm trước (từ 06:00 ngày 26 mở 26, 27, 28).</summary>
    public static DateOnly AnchorDate(DateTime utcNow)
        => DateOnly.FromDateTime(VietnamTime.ToLocal(utcNow).AddHours(-OpenMinute / 60));

    public static DateOnly LastBookableDate(DateTime utcNow) => AnchorDate(utcNow).AddDays(DaysAhead);

    /// <summary>Lượt thuê (trong cùng một ngày Việt Nam) phải nằm trọn trong 06:00 đến 22:00.</summary>
    public static bool FitsDailyHours(DateTime startLocal, DateTime endLocal)
        => startLocal.TimeOfDay >= TimeSpan.FromMinutes(OpenMinute) && endLocal.TimeOfDay <= TimeSpan.FromMinutes(CloseMinute)
           && endLocal.TimeOfDay > startLocal.TimeOfDay;
}
