namespace SportHub.BuildingBlocks.Abstractions.Training;

public interface ICoachMemberAccessReader
{
    Task<bool> HasActiveRelationshipAsync(Guid coachId, Guid memberId, CancellationToken ct = default);
}
