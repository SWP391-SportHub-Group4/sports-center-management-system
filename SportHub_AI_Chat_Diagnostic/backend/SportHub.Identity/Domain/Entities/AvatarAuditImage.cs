namespace SportHub.Identity.Domain.Entities;

/// <summary>Private, temporary audit evidence; never served by public avatar endpoints.</summary>
public sealed class AvatarAuditImage
{
    public Guid ImageId { get; set; }
    public Guid OwnerUserId { get; set; }
    public string? SourcePublicId { get; set; }
    public byte[] Content { get; set; } = [];
    public string ContentType { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
}
