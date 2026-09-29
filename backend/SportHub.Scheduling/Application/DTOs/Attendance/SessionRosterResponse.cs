namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Danh sách học viên của một buổi. Điểm danh mở từ giờ bắt đầu buổi đến 24 giờ sau khi buổi kết thúc.</summary>
public sealed record SessionRosterResponse(
    ClassSessionResponse Session,
    DateTime AttendanceOpensAtUtc,
    DateTime AttendanceClosesAtUtc,
    IReadOnlyList<RosterEntryResponse> Entries);
