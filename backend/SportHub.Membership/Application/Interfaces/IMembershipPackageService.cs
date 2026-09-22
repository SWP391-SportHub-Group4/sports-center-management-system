using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Application.Commands;
using SportHub.Membership.Application.DTOs;

namespace SportHub.Membership.Application.Interfaces;

public interface IMembershipPackageService
{
    Task<IReadOnlyList<MembershipPackageResponse>> GetAllAsync(bool includeInactive, CancellationToken ct = default);

    Task<MembershipPackageResponse> CreateAsync(SaveMembershipPackageRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<MembershipPackageResponse> UpdateAsync(int packageId, SaveMembershipPackageRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<MembershipPackageResponse> SetActiveAsync(int packageId, bool isActive, Guid actorUserId, CancellationToken ct = default);
}
