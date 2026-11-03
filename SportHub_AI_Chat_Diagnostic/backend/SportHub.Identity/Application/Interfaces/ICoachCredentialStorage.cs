namespace SportHub.Identity.Application.Interfaces;

public sealed record StoredCoachCredential(string Url, string PublicId);

public interface ICoachCredentialStorage
{
    Task<StoredCoachCredential> UploadAsync(Guid coachId, Guid credentialId, byte[] bytes, string contentType, CancellationToken ct);
    Task<byte[]> DownloadPdfAsync(string publicId, CancellationToken ct);
    Task DeleteAsync(string publicId, string contentType, CancellationToken ct);
}
