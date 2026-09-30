namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>Đọc catalog môn/phòng cho module khác. Bản cài đặt ở Scheduling/Catalog.</summary>
public interface ISportCatalogReader
{
    Task<SportInfo?> GetSportAsync(int sportId, CancellationToken cancellationToken = default);

    Task<RoomInfo?> GetRoomAsync(int roomId, CancellationToken cancellationToken = default);

    /// <summary>Loại phòng của room được phép tổ chức môn này (bảng tương thích), cả hai đang active.</summary>
    Task<bool> IsRoomCompatibleAsync(int roomId, int sportId, CancellationToken cancellationToken = default);

    /// <summary>Cả khoảng [startUtc, endUtc) nằm trong giờ mở cửa (giờ VN) của phòng, trong cùng một ngày.</summary>
    Task<bool> IsRoomOpenAsync(int roomId, DateTimeOffset startUtc, DateTimeOffset endUtc, CancellationToken cancellationToken = default);
}

/// <param name="OperationType">Gym / OneOnOne / GroupCourse / CourtRental...</param>
public sealed record SportInfo(
    int SportId,
    string Name,
    string OperationType,
    bool IsActive,
    int DefaultDurationMinutes,
    int? DefaultMaxCapacity = null);

public sealed record RoomInfo(int RoomId, string Name, int? RoomTypeId, bool IsActive, int Capacity);
