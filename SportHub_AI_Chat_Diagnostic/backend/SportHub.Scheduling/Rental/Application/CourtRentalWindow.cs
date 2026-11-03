using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>
/// BR-126/BR-128: cửa sổ thuê sân áp dụng cho Member tự thuê và Receptionist đặt hộ. Chỉ thuê trong khung
/// giờ trung tâm được cấu hình trong Settings; chỉ hiển thị và đặt trong hôm nay + 2 ngày,
/// cửa sổ đặt trước đổi ngày lúc 06:00 (quy tắc riêng với giờ hoạt động).
/// </summary>
public static class CourtRentalWindow
{
    public const int DaysAhead = 2;
    // The booking horizon rollover is separate from configurable daily opening hours.
    private const int BookingRolloverHour = 6;

    /// <summary>Ngày neo của cửa sổ: trước 06:00 vẫn thuộc ngày hôm trước (từ 06:00 ngày 26 mở 26, 27, 28).</summary>
    public static DateOnly AnchorDate(DateTime utcNow)
        => DateOnly.FromDateTime(VietnamTime.ToLocal(utcNow).AddHours(-BookingRolloverHour));

    public static DateOnly LastBookableDate(DateTime utcNow) => AnchorDate(utcNow).AddDays(DaysAhead);

}
