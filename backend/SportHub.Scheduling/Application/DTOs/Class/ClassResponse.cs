namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Quy tắc lịch lặp: thứ 0=CN..6=T7 và giờ địa phương HH:mm.</summary>
public sealed record ClassScheduleRuleResponse(int DayOfWeek, string StartTimeLocal);

/// <summary>
/// Khóa học cho công chúng/Member: không có chi phí, ngưỡng hoàn vốn hay số liệu nội bộ. Chỉ hiện khóa đã publish
/// (Draft không bao giờ lộ ra).
/// </summary>
public sealed record ClassPublicResponse(
    int ClassId,
    string Code,
    string Name,
    int SportId,
    string SportName,
    Guid? CoachId,
    string? CoachName,
    int DefaultRoomId,
    string RoomName,
    DateOnly StartDate,
    int NumSessions,
    int Capacity,
    int AvailableSeats,
    decimal Price,
    string Status,
    DateTime? FirstSessionStartUtc,
    IReadOnlyList<ClassScheduleRuleResponse> ScheduleRules);

/// <summary>Khóa học cho Manager: đủ trường tài chính/ngưỡng/đồng thời.</summary>
public sealed record ClassManagerResponse(
    int ClassId,
    string Code,
    string Name,
    int SportId,
    string SportName,
    Guid? CoachId,
    string? CoachName,
    int DefaultRoomId,
    string RoomName,
    DateOnly StartDate,
    int NumSessions,
    int Capacity,
    decimal Price,
    decimal CostAmount,
    int? BreakEvenThreshold,
    string ThresholdStatus,
    DateTime? ThresholdDeadlineUtc,
    string Status,
    int ConfirmedCount,
    int ReservedCount,
    int ActiveHoldCount,
    int AvailableSeats,
    bool CreatedByAi,
    int Version,
    DateTime CreatedAt,
    DateTime? PublishedAt,
    DateTime? FirstSessionStartUtc,
    IReadOnlyList<ClassScheduleRuleResponse> ScheduleRules);
