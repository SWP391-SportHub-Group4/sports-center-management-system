using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassService
{
    /// <summary>Khóa đã publish, cho công chúng. Draft/đã hủy không bao giờ xuất hiện.</summary>
    Task<PagedResult<ClassPublicResponse>> ListPublicAsync(int? sportId, int page, int pageSize, CancellationToken ct = default, DateOnly? fromDate = null, DateOnly? toDate = null);

    Task<ClassPublicResponse> GetPublicAsync(int classId, CancellationToken ct = default);

    Task<PagedResult<ClassManagerResponse>> ListManagerAsync(
        string? status, int? sportId, string? keyword, int page, int pageSize, CancellationToken ct = default);

    Task<ClassManagerResponse> GetManagerAsync(int classId, CancellationToken ct = default);

    /// <summary>Khóa do chính Coach phụ trách (chỉ đọc).</summary>
    Task<IReadOnlyList<ClassPublicResponse>> ListForCoachAsync(Guid coachId, CancellationToken ct = default);

    Task<ClassManagerResponse> CreateAsync(SaveClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassManagerResponse> UpdateAsync(int classId, SaveClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassManagerResponse> PublishAsync(int classId, PublishClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassManagerResponse> CancelAsync(int classId, CancelClassRequest request, Guid actorUserId, CancellationToken ct = default);
}
