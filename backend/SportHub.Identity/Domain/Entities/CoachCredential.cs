namespace SportHub.Identity.Domain.Entities;

public enum CoachCredentialKind { Certificate, Award }

/// <summary>Coach-supplied evidence displayed on the public profile; no verification is implied.</summary>
public sealed class CoachCredential
{
    public Guid CredentialId { get; set; }
    public Guid CoachUserId { get; set; }
    public UserAccount? Coach { get; set; }
    public CoachCredentialKind Kind { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Issuer { get; set; }
    public DateOnly? IssuedOn { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FileUrl { get; set; } = string.Empty;
    public string FilePublicId { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool IsPublished { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public int Version { get; set; } = 1;
    // Durable cleanup: hide immediately, retry deleting the Cloudinary asset in a background job.
    public DateTime? DeletedAtUtc { get; set; }
    public DateTime? AssetDeletedAtUtc { get; set; }
}
