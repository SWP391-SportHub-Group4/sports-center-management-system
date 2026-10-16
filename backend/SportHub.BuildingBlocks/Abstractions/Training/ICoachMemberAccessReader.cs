namespace SportHub.BuildingBlocks.Abstractions.Training;

public interface ICoachMemberAccessReader
{
    /// <summary>Compatibility name: authority is a current primary class assignment with confirmed enrollment, not relationship history.</summary>
    Task<bool> HasActiveRelationshipAsync(Guid coachId, Guid memberId, CancellationToken ct = default);
}
