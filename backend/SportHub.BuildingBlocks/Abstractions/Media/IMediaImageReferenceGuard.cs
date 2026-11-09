namespace SportHub.BuildingBlocks.Abstractions.Media;

public interface IMediaImageReferenceGuard
{
    /// <summary>Call inside the writer transaction. Serializes attachments with deletion until commit.</summary>
    Task ProtectAttachmentsAsync(IEnumerable<string?> candidateValues, IEnumerable<string?> existingValues,
        CancellationToken ct = default);
}
