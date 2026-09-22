using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface ICoachMemberRelationshipService : ICoachRelationshipRegistrar
{
    Task<IReadOnlyList<CoachMemberRelationshipResponse>> SearchAsync(
        Guid? coachId, Guid? memberId, bool activeOnly, CancellationToken ct = default);

    Task<CoachMemberRelationshipResponse> CreateAsync(
        CreateRelationshipRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<CoachMemberRelationshipResponse> EndAsync(
        Guid relationshipId, string reason, Guid actorUserId, CancellationToken ct = default);

    // EnsureClassBasedAsync kế thừa từ ICoachRelationshipRegistrar: module Scheduling gọi qua
    // abstraction đó khi hội viên đăng ký lớp, không tham chiếu trực tiếp module Training.
}
