using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Application.Services;
using SportHub.Membership.Application.Interfaces;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.Coach)]
[Route("api/coaches/me/students")]
public sealed class CoachStudentsController(ISportHubDbContext db, PersonalTrainerGuard personalTrainers,
    IMemberTrainingProfileService trainingProfiles, MemberBmiProfileService bmiProfiles) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? search, [FromQuery] string health = "all",
        [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        if (search?.Length > 150)
            throw new BadRequestException("student_search_too_long", "Search must not exceed 150 characters.");
        if (health is not ("all" or "notes" or "missing"))
            throw new BadRequestException("student_filter_invalid", "Choose all, notes or missing.");
        var relationships = db.Set<CoachMemberRelationship>().AsNoTracking()
            .Where(r => r.CoachId == coachId && r.Status == RelationshipStatus.Active);
        var profiles = db.Set<MemberTrainingProfile>().AsNoTracking();
        var query = db.Set<UserAccount>().AsNoTracking().Where(u => relationships.Any(r => r.MemberId == u.UserId));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(u => u.Email.ToLower().Contains(term)
                || (u.Profile != null && u.Profile.FullName.ToLower().Contains(term)));
        }
        if (health == "notes") query = query.Where(u => profiles.Any(p => p.MemberId == u.UserId && p.Notes != null && p.Notes.Trim() != ""));
        if (health == "missing") query = query.Where(u => !profiles.Any(p => p.MemberId == u.UserId));
        var totalCount = await query.CountAsync(ct);
        page = Math.Clamp(page, 1, 100000);
        const int pageSize = 12;
        var members = await query.OrderBy(u => u.Profile != null ? u.Profile.FullName : u.Email).ThenBy(u => u.UserId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new { MemberId = u.UserId, MemberName = u.Profile != null ? u.Profile.FullName : u.Email, MemberEmail = u.Email,
                StartedAt = relationships.Where(r => r.MemberId == u.UserId).Min(r => r.StartedAt) }).ToListAsync(ct);
        var ids = members.Select(m => m.MemberId).ToList();
        var pageProfiles = await profiles.Where(p => ids.Contains(p.MemberId)).ToDictionaryAsync(p => p.MemberId, ct);
        var items = members.Select(m => {
            pageProfiles.TryGetValue(m.MemberId, out var profile);
            return new { m.MemberId, m.MemberName, m.MemberEmail, m.StartedAt, Goal = profile?.Goal,
                Level = profile?.ExperienceLevel.ToString(), HasTrainingProfile = profile != null,
                HasHealthNotes = !string.IsNullOrWhiteSpace(profile?.Notes) };
        });
        return Ok(new { Items = items, TotalCount = totalCount, Page = page, PageSize = pageSize });
    }

    [HttpGet("{memberId:guid}/health-profile")]
    public async Task<IActionResult> HealthProfile(Guid memberId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        if (!await db.Set<CoachMemberRelationship>().AnyAsync(r => r.CoachId == coachId && r.MemberId == memberId
                && r.Status == RelationshipStatus.Active, ct))
            throw new ForbiddenException("no_active_relationship", "Bạn không phụ trách hội viên này.");
        var trainingProfile = await trainingProfiles.GetAsync(memberId, ct);
        var bmiProfile = await bmiProfiles.GetAsync(memberId, ct);
        return Ok(new { TrainingProfile = trainingProfile, BmiProfile = bmiProfile });
    }
}
