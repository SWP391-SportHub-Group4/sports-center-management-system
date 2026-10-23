using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Logging;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Api;

public sealed class UploadMediaVideoRequest
{
    public IFormFile? File { get; set; }
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/media/videos")]
public sealed class MediaVideosController(IMediaVideoStorage storage, ISportHubDbContext db,
    IAuditWriter audit, ILogger<MediaVideosController> logger) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("avatar-write")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(26 * 1024 * 1024)]
    public async Task<IActionResult> Upload([FromForm] UploadMediaVideoRequest request, CancellationToken ct)
    {
        var file = request.File;
        if (file is null || file.Length == 0 || file.Length > 25 * 1024 * 1024)
            throw new BadRequestException("media_video_size_invalid", "Choose a WebM video no larger than 25 MB.");
        if (file.ContentType != "video/webm" || !Path.GetExtension(file.FileName).Equals(".webm", StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("media_video_type_invalid", "Choose a WebM video.");
        await using var output = new MemoryStream();
        await file.CopyToAsync(output, ct);
        var bytes = output.ToArray();
        if (bytes.Length < 4 || !bytes.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }))
            throw new BadRequestException("media_video_type_invalid", "Choose a valid WebM video.");
        var actor = User.RequireUserId();
        var video = await storage.UploadAsync(actor, bytes, ct);
        try
        {
            audit.Write(new AuditEntry(actor, "UPLOAD_MEDIA_VIDEO", "LandingPageContent", "1", NewValue: JsonSerializer.Serialize(video)));
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            try { using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(10)); await storage.DeleteAsync(video.PublicId, cleanup.Token); }
            catch (Exception ex) { logger.LogWarning("Unused video cleanup failed for {PublicId}: {FailureType}", video.PublicId, ex.GetType().Name); }
            throw;
        }
        return Ok(video);
    }
}
