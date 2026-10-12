using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Api;

public sealed class CreateMemberSupportRequest
{
    [Required]
    public Guid MemberId { get; set; }

    [Required, MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(200)]
    public string Subject { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(2000)]
    public string Description { get; set; } = string.Empty;
}

public sealed record MemberSupportRequestResponse(
    Guid RequestId,
    Guid MemberId,
    Guid RecordedByUserId,
    string Category,
    string Subject,
    string Description,
    string Status,
    DateTime CreatedAt);

[ApiController]
[Authorize(Policy = SportHubPolicies.FrontDesk)]
[Route("api/member-support-requests")]
public sealed class MemberSupportRequestsController(
    ISportHubDbContext db,
    IClock clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid memberId,
        CancellationToken ct = default)
    {
        var memberExists = await db
            .Set<UserAccount>()
            .AsNoTracking()
            .Include(x => x.Role)
            .AnyAsync(
                x =>
                    x.UserId == memberId &&
                    x.Role != null &&
                    x.Role.RoleName == UserRole.Member,
                ct);

        if (!memberExists)
        {
            return NotFound(new
            {
                error = "member_not_found",
                message = "Member was not found."
            });
        }

        var rows = await db
            .Set<MemberSupportRequest>()
            .AsNoTracking()
            .Where(x => x.MemberId == memberId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(50)
            .Select(x =>
                new MemberSupportRequestResponse(
                    x.RequestId,
                    x.MemberId,
                    x.RecordedByUserId,
                    x.Category,
                    x.Subject,
                    x.Description,
                    x.Status,
                    x.CreatedAt))
            .ToListAsync(ct);

        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateMemberSupportRequest request,
        CancellationToken ct = default)
    {
        var member = await db
            .Set<UserAccount>()
            .AsNoTracking()
            .Include(x => x.Role)
            .SingleOrDefaultAsync(
                x => x.UserId == request.MemberId,
                ct);

        if (
            member is null ||
            member.Role is null ||
            member.Role.RoleName != UserRole.Member)
        {
            return NotFound(new
            {
                error = "member_not_found",
                message = "Member was not found."
            });
        }

        var subject = request.Subject.Trim();
        var description = request.Description.Trim();
        var category = request.Category.Trim().ToUpperInvariant();

        if (subject.Length < 3 ||
            description.Length < 3)
        {
            return BadRequest(new
            {
                error = "support_request_invalid",
                message =
                    "Subject and description must contain at least 3 characters."
            });
        }

        var allowedCategories = new[]
        {
            "GENERAL",
            "MEMBERSHIP",
            "CLASS",
            "PAYMENT",
            "PT",
            "OTHER"
        };

        if (!allowedCategories.Contains(category))
        {
            return BadRequest(new
            {
                error = "support_category_invalid",
                message = "Invalid support request category."
            });
        }

        var entity = new MemberSupportRequest
        {
            RequestId = Guid.NewGuid(),
            MemberId = request.MemberId,
            RecordedByUserId = User.RequireUserId(),
            Category = category,
            Subject = subject,
            Description = description,
            Status = "OPEN",
            CreatedAt = clock.UtcNow
        };

        db.Set<MemberSupportRequest>().Add(entity);

        await db.SaveChangesAsync(ct);

        return Ok(
            new MemberSupportRequestResponse(
                entity.RequestId,
                entity.MemberId,
                entity.RecordedByUserId,
                entity.Category,
                entity.Subject,
                entity.Description,
                entity.Status,
                entity.CreatedAt));
    }
}