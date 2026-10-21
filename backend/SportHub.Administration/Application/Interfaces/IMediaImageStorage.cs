namespace SportHub.Administration.Application.Interfaces;

public sealed record StoredMediaImage(string Url, string PublicId, int Width, int Height);

public interface IMediaImageStorage
{
    Task<StoredMediaImage> UploadAsync(Guid actorId, byte[] bytes, string contentType, CancellationToken ct);
    Task DeleteAsync(string publicId, CancellationToken ct);
}
