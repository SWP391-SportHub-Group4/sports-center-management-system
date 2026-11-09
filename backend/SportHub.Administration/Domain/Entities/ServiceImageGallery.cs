namespace SportHub.Administration.Domain.Entities;

/// <summary>A presentation aggregate, independent of a class's scheduling lifecycle.</summary>
public sealed class ServiceImageGallery
{
    public string Kind { get; set; } = "";
    public int ServiceId { get; set; }
    public long Version { get; set; }
    public Guid? CoverImageId { get; set; }
}

public sealed class ServiceImageAsset
{
    public Guid ImageId { get; set; }
    public string Kind { get; set; } = "";
    public int ServiceId { get; set; }
    public Guid UploadedByUserId { get; set; }
    public string Url { get; set; } = "";
    public string PublicId { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public string AltText { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

/// <summary>Committed with removal, retried independently of the successful gallery save.</summary>
public sealed class ServiceImageDeletion
{
    public Guid DeletionId { get; set; }
    public string PublicId { get; set; } = "";
    public string Url { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime NextAttemptAtUtc { get; set; }
    public int Attempts { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}
