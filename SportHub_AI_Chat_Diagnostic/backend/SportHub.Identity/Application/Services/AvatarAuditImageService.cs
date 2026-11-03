using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Application.Services;

public sealed class AvatarAuditImageService(ISportHubDbContext db, HttpClient http,
    IConfiguration config, IClock clock, ILogger<AvatarAuditImageService> logger)
{
    public string Record(Guid ownerId, string? publicId, byte[] content, string contentType)
    {
        AvatarService.ValidateImage(content, contentType);
        var image = new AvatarAuditImage { ImageId = Guid.NewGuid(), OwnerUserId = ownerId,
            SourcePublicId = publicId, Content = content, ContentType = contentType,
            CreatedAtUtc = clock.UtcNow, ExpiresAtUtc = clock.UtcNow.AddDays(30) };
        db.Set<AvatarAuditImage>().Add(image);
        return JsonSerializer.Serialize(new { avatarSnapshotId = image.ImageId,
            avatarSnapshotExpiresAtUtc = image.ExpiresAtUtc, hadAvatar = true });
    }

    public async Task<string> CaptureExistingAsync(Guid ownerId, string? publicId, string? url, CancellationToken ct)
    {
        if (url is null) return JsonSerializer.Serialize(new { hadAvatar = false });
        var existing = publicId is null ? null : await db.Set<AvatarAuditImage>().AsNoTracking()
            .Where(x => x.OwnerUserId == ownerId && x.SourcePublicId == publicId && x.ExpiresAtUtc > clock.UtcNow)
            .OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
        if (existing is not null) return Record(ownerId, publicId, existing.Content, existing.ContentType);
        try
        {
            // Only our own Cloudinary delivery path is fetched. Redirects are disabled on this client.
            if (!Uri.TryCreate(config["CLOUDINARY_URL"], UriKind.Absolute, out var cloud)
                || cloud.Scheme != "cloudinary" || !Uri.TryCreate(url, UriKind.Absolute, out var uri)
                || uri.Scheme != "https" || uri.Host != "res.cloudinary.com" || !uri.IsDefaultPort
                || !uri.AbsolutePath.StartsWith($"/{cloud.Host}/image/upload/", StringComparison.Ordinal)
                || publicId is null || !publicId.StartsWith($"sporthub/avatars/{ownerId:N}/", StringComparison.Ordinal))
                return JsonSerializer.Serialize(new { hadAvatar = true });
            using var response = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > AvatarService.MaxUploadBytes)
                return JsonSerializer.Serialize(new { hadAvatar = true });
            var type = response.Content.Headers.ContentType?.MediaType;
            await using var input = await response.Content.ReadAsStreamAsync(ct);
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            int count;
            while ((count = await input.ReadAsync(chunk, ct)) > 0)
            {
                if (buffer.Length + count > AvatarService.MaxUploadBytes) return JsonSerializer.Serialize(new { hadAvatar = true });
                buffer.Write(chunk, 0, count);
            }
            var bytes = buffer.ToArray();
            AvatarService.ValidateImage(bytes, type ?? "");
            return Record(ownerId, publicId, bytes, type!);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            // A missing legacy image must not prevent moderation/removal of the current public photo.
            logger.LogWarning("Could not archive previous avatar for audit ({ErrorType})", ex.GetType().Name);
            return JsonSerializer.Serialize(new { hadAvatar = true });
        }
    }

    public Task<int> PurgeExpiredAsync(CancellationToken ct)
        => db.Set<AvatarAuditImage>().Where(x => x.ExpiresAtUtc <= clock.UtcNow).ExecuteDeleteAsync(ct);
}
