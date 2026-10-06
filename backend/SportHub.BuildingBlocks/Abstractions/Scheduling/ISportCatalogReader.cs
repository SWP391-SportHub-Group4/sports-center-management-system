namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>Đọc catalog môn/phòng cho module khác. Bản cài đặt ở Scheduling/Catalog.</summary>
public interface ISportCatalogReader
{
    Task<SportInfo?> GetSportAsync(int sportId, CancellationToken cancellationToken = default);

    Task<RoomInfo?> GetRoomAsync(int roomId, CancellationToken cancellationToken = default);

    /// <summary>Loại phòng của room được phép tổ chức môn này (bảng tương thích), cả hai đang active.</summary>
    Task<bool> IsRoomCompatibleAsync(int roomId, int sportId, CancellationToken cancellationToken = default);

    /// <summary>Môn đang hoạt động và dịch vụ này đang bật. Cờ chỉ chặn giao dịch mới, không hủy thứ đã bán.</summary>
    Task<bool> IsServiceEnabledAsync(int sportId, SportServiceType serviceType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Môn đang hoạt động có dịch vụ này bật. Với MembershipAccess/PersonalTraining luôn là môn Gym
    /// (backend chỉ cho bật hai dịch vụ này ở môn có mã <see cref="SportCodes.Gym"/>).
    /// </summary>
    Task<SportInfo?> GetSportForServiceAsync(SportServiceType serviceType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Phòng được dùng cho dịch vụ này: phòng active và loại phòng nằm trong tập loại phòng của dịch vụ
    /// (<c>service_room_types</c>). Dùng cho PT để phòng Gym không tự thành phòng PT.
    /// </summary>
    Task<bool> IsRoomAllowedForServiceAsync(int roomId, SportServiceType serviceType, CancellationToken cancellationToken = default);

    /// <summary>Cả khoảng [startUtc, endUtc) nằm trong giờ mở cửa (giờ VN) của phòng, trong cùng một ngày.</summary>
    Task<bool> IsRoomOpenAsync(int roomId, DateTimeOffset startUtc, DateTimeOffset endUtc, CancellationToken cancellationToken = default);
}

/// <param name="Services">Các dịch vụ đã cấu hình cho môn (kể cả đang tắt).</param>
/// <param name="DefaultDurationMinutes">Mặc định lớp từ dịch vụ GroupCourse; 0 khi môn không có lớp.</param>
public sealed record SportInfo(
    int SportId,
    string Code,
    string Name,
    bool IsActive,
    IReadOnlyList<SportServiceInfo> Services,
    int DefaultDurationMinutes = 0,
    int? DefaultMaxCapacity = null)
{
    public bool HasEnabledService(SportServiceType type) => Services.Any(s => s.ServiceType == type && s.IsEnabled);
}

public sealed record SportServiceInfo(
    SportServiceType ServiceType,
    bool IsEnabled,
    int? DefaultSessionMinutes = null,
    int? DefaultMaxCapacity = null,
    int OfferingId = 0);

public sealed record RoomInfo(int RoomId, string Name, int? RoomTypeId, bool IsActive, int Capacity);
