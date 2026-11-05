using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>
/// BR-126/BR-128: cửa sổ thuê sân áp dụng cho Member tự thuê và Receptionist đặt hộ. Chỉ thuê trong khung
/// giờ trung tâm được cấu hình trong Settings; cho đặt trước tối đa 3 ngày tính theo ngày Việt Nam.
/// </summary>
public static class CourtRentalWindow
{
    public const int DaysAhead = 3;

    /// <summary>Ngày hiện tại ở Việt Nam; ngày 3 được đặt đến hết ngày 6, kể cả trước 06:00.</summary>
    public static DateOnly AnchorDate(DateTime utcNow)
        => DateOnly.FromDateTime(VietnamTime.ToLocal(utcNow));

    public static DateOnly LastBookableDate(DateTime utcNow) => AnchorDate(utcNow).AddDays(DaysAhead);

}
