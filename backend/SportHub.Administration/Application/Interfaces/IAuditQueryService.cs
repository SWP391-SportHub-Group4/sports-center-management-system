using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Services;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Pagination;

namespace SportHub.Administration.Application.Interfaces;

public interface IAuditQueryService
{
    Task<IReadOnlyList<string>> ListActionsAsync(bool accountsOnly = false, CancellationToken ct = default);

    Task<PagedResult<AuditLogResponse>> SearchAsync(
        string? action, string? targetEntity, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default, Guid? actorId = null, bool accountsOnly = false,
        string? sortBy = null, string? sortDirection = null, string? targetId = null);
}
