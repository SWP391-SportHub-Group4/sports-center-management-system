using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

/// <summary>
/// Chỉ đọc. Ghi danh KHÔNG có đường tạo/hủy trực tiếp từ API: chỉ sinh khi thanh toán thành công (fulfillment) và kết thúc
/// qua hoàn điểm/hủy lớp/chuyển lớp.
/// </summary>
public interface IEnrollmentService
{
    Task<PagedResult<EnrollmentResponse>> ListForMemberAsync(Guid memberId, int page, int pageSize, CancellationToken ct = default);
}
