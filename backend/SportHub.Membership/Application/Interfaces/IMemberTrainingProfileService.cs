using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Application.Commands;
using SportHub.Membership.Application.DTOs;

namespace SportHub.Membership.Application.Interfaces;

public interface IMemberTrainingProfileService
{
    Task<MemberTrainingProfileResponse?> GetAsync(Guid memberId, CancellationToken ct = default);

    Task<MemberTrainingProfileResponse> SaveAsync(Guid memberId, SaveTrainingProfileRequest request, CancellationToken ct = default);
}
