namespace SportHub.BuildingBlocks.Abstractions.Training;

/// <summary>Read-only relationship check for modules that cannot depend on Training.</summary>
public interface ICoachMemberAccess
{
    Task<bool> HasActiveRelationshipAsync(Guid coachId, Guid memberId, CancellationToken ct = default);
}
