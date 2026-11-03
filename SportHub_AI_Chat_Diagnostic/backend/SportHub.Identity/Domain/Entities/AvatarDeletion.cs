namespace SportHub.Identity.Domain.Entities;

/// <summary>Persisted cleanup for a Cloudinary image after its database reference is removed.</summary>
public sealed class AvatarDeletion
{
    public Guid DeletionId { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public int Attempts { get; set; }
    public DateTime? LastAttemptAt { get; set; }
}
