namespace SportHub.Administration.Application.Interfaces;

public sealed record StoredMediaVideo(string Url, string PosterUrl, string PublicId, int Width, int Height, double Duration);

public interface IMediaVideoStorage
{
    Task<StoredMediaVideo> UploadAsync(Guid actorId, byte[] bytes, CancellationToken ct);
    Task DeleteAsync(string publicId, CancellationToken ct);
}
