using Microsoft.AspNetCore.Http;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Xung đột lịch phòng/coach: 409 <c>occupancy_conflict</c> kèm danh sách khoảng đang chiếm chỗ
/// (không lộ SQL). Middleware trả thêm mảng <see cref="Conflicts"/> trong body.
/// </summary>
public sealed class OccupancyConflictException(IReadOnlyList<OccupancyConflict> conflicts)
    : AppException(StatusCodes.Status409Conflict, "occupancy_conflict", "Khung giờ đã có lịch khác chiếm phòng hoặc coach.")
{
    public IReadOnlyList<OccupancyConflict> Conflicts { get; } = conflicts;
}
