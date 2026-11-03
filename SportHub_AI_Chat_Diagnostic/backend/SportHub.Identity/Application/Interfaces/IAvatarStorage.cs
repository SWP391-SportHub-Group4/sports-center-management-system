namespace SportHub.Identity.Application.Interfaces;

public sealed record StoredAvatar(string Url, string PublicId);

public interface IAvatarStorage
{
    Task<StoredAvatar> UploadAsync(Guid userId, byte[] image, string contentType, CancellationToken ct);
    Task<StoredAvatar> ImportGooglePictureAsync(Guid userId, string pictureUrl, CancellationToken ct);
    Task DeleteAsync(string publicId, CancellationToken ct);
}
