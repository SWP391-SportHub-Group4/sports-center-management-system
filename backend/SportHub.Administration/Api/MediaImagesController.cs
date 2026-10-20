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

public sealed class UploadMediaImageRequest
{
    public IFormFile? File { get; set; }
    public string Preset { get; set; } = "landscape";
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/media/images")]
public sealed class MediaImagesController(IMediaImageStorage storage, ISportHubDbContext db,
    IAuditWriter audit, ILogger<MediaImagesController> logger) : ControllerBase
{
    private const int MaxBytes = 10 * 1024 * 1024;

    [HttpPost]
    [EnableRateLimiting("avatar-write")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<IActionResult> Upload([FromForm] UploadMediaImageRequest request, CancellationToken ct)
    {
        var file = request.File;
        var ratio = request.Preset switch {
            "landscape" => 3m / 2m,
            "booking" => 4m / 5m,
            _ => throw new BadRequestException("media_preset_invalid", "Choose a supported image frame.")
        };
        if (file is null || file.Length == 0 || file.Length > MaxBytes)
            throw new BadRequestException("media_image_size_invalid", "Choose an image no larger than 10 MB.");
        await using var input = file.OpenReadStream();
        await using var output = new MemoryStream();
        await input.CopyToAsync(output, ct);
        var bytes = output.ToArray();
        var jpeg = bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff;
        var png = bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var webp = bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8);
        if (!((file.ContentType == "image/jpeg" && jpeg) || (file.ContentType == "image/png" && png) || (file.ContentType == "image/webp" && webp)))
            throw new BadRequestException("media_image_type_invalid", "Choose a JPG, PNG or WebP image.");
        var actor = User.RequireUserId();
        var image = await storage.UploadAsync(actor, bytes, file.ContentType, ct);
        try
        {
            if (Math.Abs((decimal)image.Width / image.Height - ratio) > Math.Max(0.01m, 2m / image.Height))
                throw new BadRequestException("media_aspect_ratio_invalid", "Crop the image to the required frame before uploading.");
            audit.Write(new AuditEntry(actor, "UPLOAD_MEDIA_IMAGE", "LandingPageContent", "1", NewValue: JsonSerializer.Serialize(image)));
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            // Do not retain an upload if its audit cannot be persisted.
            try { using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(10)); await storage.DeleteAsync(image.PublicId, cleanup.Token); }
            catch (Exception ex) { logger.LogWarning("Unused media upload cleanup failed for {PublicId}: {FailureType}", image.PublicId, ex.GetType().Name); }
            throw;
        }
        return Ok(image);
    }
}
