using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Api;

[ApiController]
[AllowAnonymous]
[Route("api/service-images")]
public sealed class ServiceImagesController(ServiceImageService images) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Batch([FromQuery] string kind, [FromQuery] string ids, CancellationToken ct)
    {
        var values = ids.Split(',', StringSplitOptions.TrimEntries);
        if (values.Length > 100 || values.Any(x => !int.TryParse(x, out var id) || id <= 0))
            throw new BadRequestException("service_image_ids_invalid", "Choose between 1 and 100 positive service IDs.");
        return Ok(new { Items = await images.ReadBatchAsync(kind, values.Select(int.Parse).ToArray(), false, ct) });
    }

    [HttpGet("{kind}/{id:int}")]
    public async Task<IActionResult> Get(string kind, int id, CancellationToken ct)
        => Ok(await images.ReadAsync(kind, id, false, ct));
}

public sealed class UploadServiceImageRequest
{
    public IFormFile? File { get; set; }
    public string? AltText { get; set; }
}

[ApiController]
[Authorize(Policy = SportHubPolicies.Coach)]
[Route("api/coaches/me/class-images")]
public sealed class CoachServiceImagesController(ServiceImageService images) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string ids, CancellationToken ct)
    {
        var values = ids.Split(',', StringSplitOptions.TrimEntries);
        if (values.Length > 100 || values.Any(x => !int.TryParse(x, out var id) || id <= 0))
            throw new BadRequestException("service_image_ids_invalid", "Choose between 1 and 100 positive class IDs.");
        return Ok(new { Items = await images.ReadCoachClassesAsync(values.Select(int.Parse).ToArray(), User.RequireUserId(), ct) });
    }
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/service-images/{kind}/{id:int}")]
public sealed class ManagerServiceImagesController(ServiceImageService images) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(string kind, int id, CancellationToken ct)
        => Ok(await images.ReadAsync(kind, id, true, ct));

    [HttpPost]
    [Consumes("multipart/form-data")]
    [EnableRateLimiting("avatar-write")]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<IActionResult> Upload(string kind, int id, [FromForm] UploadServiceImageRequest request, CancellationToken ct)
    {
        if (request.File is null || request.File.Length == 0 || request.File.Length > ServiceImageValidation.MaxBytes)
            throw new BadRequestException("service_image_size_invalid", "Choose an image no larger than 10 MB.");
        await using var input = request.File.OpenReadStream();
        await using var output = new MemoryStream();
        await input.CopyToAsync(output, ct);
        return Ok(await images.UploadAsync(kind, id, User.RequireUserId(), output.ToArray(), request.File.ContentType, request.AltText, ct));
    }

    [HttpPut]
    public async Task<IActionResult> Save(string kind, int id, [FromBody] SaveServiceGalleryRequest request, CancellationToken ct)
        => Ok(await images.PublishAsync(kind, id, User.RequireUserId(), request, ct));

    [HttpDelete("{imageId}")]
    public async Task<IActionResult> Discard(string kind, int id, string imageId, CancellationToken ct)
    {
        await images.DiscardAsync(kind, id, imageId, User.RequireUserId(), ct);
        return NoContent();
    }
}
