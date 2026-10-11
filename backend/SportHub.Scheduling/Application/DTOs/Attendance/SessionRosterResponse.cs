namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Điểm danh mở từ 5 phút trước buổi đến 24 giờ sau khi buổi kết thúc.</summary>
public sealed record SessionRosterResponse(
    ClassSessionResponse Session,
    DateTime AttendanceOpensAtUtc,
    DateTime AttendanceClosesAtUtc,
    IReadOnlyList<RosterEntryResponse> Entries);
