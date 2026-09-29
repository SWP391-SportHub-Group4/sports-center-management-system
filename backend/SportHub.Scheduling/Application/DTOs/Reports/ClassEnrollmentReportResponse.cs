namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Sĩ số từng khóa: Capacity, Confirmed, giữ chỗ đang hiệu lực, còn trống, tỉ lệ lấp đầy và ngưỡng hoàn vốn.</summary>
public sealed record ClassEnrollmentRowResponse(
    int ClassId,
    string Code,
    string Name,
    int SportId,
    string SportName,
    string Status,
    int Capacity,
    int ConfirmedCount,
    int ActiveHoldCount,
    int AvailableSeats,
    decimal FillRatio,
    int? BreakEvenThreshold,
    string ThresholdStatus,
    DateTime? FirstSessionStartUtc);

public sealed record ClassEnrollmentReportResponse(
    DateOnly FromDate,
    DateOnly ToDate,
    int TotalClasses,
    int TotalCapacity,
    int TotalConfirmed,
    int TotalActiveHolds,
    decimal FillRatio,
    IReadOnlyList<ClassEnrollmentRowResponse> Classes);
