using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Api;
[ApiController]
[Authorize(Policy = SportHubPolicies.SystemAdministrator)]
[Route("api/admin/audit-avatar-images")]
public sealed class AvatarAuditImagesController(ISportHubDbContext db, IClock clock) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store, max-age=0";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        var image = await db.Set<AvatarAuditImage>().AsNoTracking()
            .Where(x => x.ImageId == id && x.ExpiresAtUtc > clock.UtcNow).SingleOrDefaultAsync(ct);
        if (image is null) return NotFound(new { error = "audit_image_unavailable", message = "Image no longer available." });
        return File(image.Content, image.ContentType);
    }
}
