using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Membership.Application.Interfaces;

public interface IMemberPackageService
{
    Task<IReadOnlyList<MemberPackageResponse>> GetByMemberAsync(Guid memberId, CancellationToken ct = default);

    Task<PagedResult<MemberPackageResponse>> SearchAsync(
        string? status, string? keyword, int page, int pageSize, CancellationToken ct = default);

    Task<MemberPackageResponse> CancelAsync(Guid memberPackageId, string reason, Guid actorUserId, CancellationToken ct = default);

    /// <summary>Số gói đang dùng được — dùng cho dashboard, không phải điều kiện nghiệp vụ.</summary>
    Task<int> CountUsableAsync(Guid memberId, CancellationToken ct = default);
}
