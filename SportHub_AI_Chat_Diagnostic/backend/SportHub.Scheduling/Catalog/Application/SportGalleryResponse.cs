namespace SportHub.Scheduling.Catalog.Application;

/// <summary>Public display metadata, including inactive sports, without service/readiness details.</summary>
public sealed record SportGalleryResponse(int SportId, string Code, string Name, string? ImageUrl, int SortOrder, bool IsActive);
