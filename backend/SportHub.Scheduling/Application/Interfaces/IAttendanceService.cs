using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IAttendanceService
{
    /// <summary>
    /// Lễ tân điểm danh (Present/Absent) một ghi danh ở một buổi. Ghi lần đầu hoặc sửa trong cửa sổ:
    /// từ giờ bắt đầu buổi đến 24 giờ sau khi buổi kết thúc.
    /// </summary>
    Task<AttendanceResponse> MarkAsync(
        Guid sessionId, Guid enrollmentId, MarkAttendanceRequest request, Guid recorderUserId, CancellationToken ct = default);
}
