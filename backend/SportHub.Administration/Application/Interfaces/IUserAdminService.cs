using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Application.Interfaces;

public interface IUserAdminService
{
    Task<PagedResult<UserAdminResponse>> SearchAsync(
        string? keyword, string? role, string? status, int page, int pageSize, CancellationToken ct = default);

    Task<UserAdminResponse> GetAsync(Guid userId, CancellationToken ct = default);

    Task<UserAdminResponse> CreateStaffAsync(CreateStaffAccountRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<UserAdminResponse> ChangeRoleAsync(Guid userId, ChangeUserRoleRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<UserAdminResponse> SetStatusAsync(Guid userId, UserStatus target, string reason, Guid actorUserId, CancellationToken ct = default);
}
