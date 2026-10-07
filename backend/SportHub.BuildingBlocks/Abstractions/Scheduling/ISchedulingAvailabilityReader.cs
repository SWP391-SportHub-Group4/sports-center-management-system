namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Đọc phần lịch đã bị chiếm của Coach và phòng theo dịch vụ, để module khác (PT tự đặt lịch) tính khung trống.
/// Chỉ đọc; chống trùng thật vẫn do exclusion constraint của DB khi ghi. Bản cài đặt ở Scheduling/Occupancy.
/// </summary>
public interface ISchedulingAvailabilityReader
{
    /// <summary>Các khoảng Coach bị chiếm (lớp, PT, thuê sân, block) giao với [fromUtc, toUtc).</summary>
    Task<IReadOnlyList<TimeWindow>> GetCoachBusyAsync(
        Guid coachId, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>
    /// Phòng active dùng được cho dịch vụ (loại phòng nằm trong tập của dịch vụ), kèm giờ mở cửa theo thứ và
    /// các khoảng đã bị chiếm giao với [fromUtc, toUtc).
    /// </summary>
    Task<IReadOnlyList<RoomAvailability>> GetServiceRoomsAsync(
        SportServiceType serviceType, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);
}

/// <summary>Khoảng nửa-mở [StartUtc, EndUtc).</summary>
public sealed record TimeWindow(DateTime StartUtc, DateTime EndUtc);

/// <param name="DayOfWeek">0 = Chủ nhật … 6 = Thứ bảy, giờ địa phương (Asia/Ho_Chi_Minh).</param>
public sealed record RoomOpeningDay(int DayOfWeek, TimeOnly Open, TimeOnly Close);

public sealed record RoomAvailability(
    int RoomId,
    string Name,
    IReadOnlyList<RoomOpeningDay> OpeningHours,
    IReadOnlyList<TimeWindow> Busy);
