using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.API.Controllers;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/notices")]
public sealed class NoticeRecipientsController(ISportHubDbContext db) : ControllerBase
{
    [HttpGet("recipient-options")]
    public async Task<IActionResult> Options([FromQuery] string role, [FromQuery] string? keyword,
        [FromQuery] int? classId, [FromQuery] int? sportId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var selectedRole = role.Trim().ToUpperInvariant() switch
        {
            "SYSTEM_ADMINISTRATOR" => UserRole.SystemAdministrator,
            "CENTER_MANAGER" => UserRole.CenterManager,
            "RECEPTIONIST" => UserRole.Receptionist,
            "COACH" => UserRole.Coach,
            "MEMBER" => UserRole.Member,
            _ => throw new BadRequestException("notice_recipient_role_invalid", "Choose a recipient role.")
        };
        if ((classId.HasValue && selectedRole != UserRole.Member) || (sportId.HasValue && selectedRole != UserRole.Coach))
            throw new BadRequestException("notice_recipient_filter_invalid", "This filter does not apply to the selected role.");
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<UserAccount>().AsNoTracking()
            .Where(u => u.Status == UserStatus.Active && u.Role!.RoleName == selectedRole);
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(u => (u.Profile != null && u.Profile.FullName != ""
                ? u.Profile.FullName : u.Email).ToLower().Contains(term));
        }
        if (sportId is int specialty)
            query = query.Where(u => db.Set<UserSportSpecialty>().Any(s => s.UserId == u.UserId && s.SportId == specialty));
        if (classId is int course)
            query = query.Where(u => db.Set<Enrollment>().Any(e => e.MemberId == u.UserId && e.ClassId == course
                && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
                && (e.Class!.Status == ClassStatus.Published || e.Class.Status == ClassStatus.InProgress)));
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(u => u.Profile != null ? u.Profile.FullName : u.Email).ThenBy(u => u.UserId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new NoticeRecipientOption(u.UserId,
                u.Profile != null && u.Profile.FullName != "" ? u.Profile.FullName : u.Email,
                u.Email, u.Profile != null ? u.Profile.AvatarUrl : null)).ToListAsync(ct);
        return Ok(new PagedResult<NoticeRecipientOption> { Items = rows, TotalCount = total, Page = page, PageSize = pageSize });
    }

    [HttpGet("recipient-filters")]
    public async Task<IActionResult> Filters(CancellationToken ct)
    {
        var classes = await db.Set<Class>().AsNoTracking()
            .Where(c => c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)
            .OrderBy(c => c.Name).ThenBy(c => c.ClassId)
            .Select(c => new { c.ClassId, c.Code, c.Name }).ToListAsync(ct);
        var specialties = await db.Set<Sport>().AsNoTracking()
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .Select(s => new { s.SportId, s.Name }).ToListAsync(ct);
        return Ok(new { classes, specialties });
    }
}

public sealed record NoticeRecipientOption(Guid UserId, string Name, string Email, string? AvatarUrl);
