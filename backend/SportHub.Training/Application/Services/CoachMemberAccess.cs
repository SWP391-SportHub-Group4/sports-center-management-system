using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.Services;

public sealed class CoachMemberAccess(ISportHubDbContext db) : ICoachMemberAccess
{
    public Task<bool> HasActiveRelationshipAsync(Guid coachId, Guid memberId, CancellationToken ct = default)
        => db.Set<CoachMemberRelationship>().AsNoTracking().AnyAsync(
            r => r.CoachId == coachId && r.MemberId == memberId
                 && r.Status == RelationshipStatus.Active, ct);
}
