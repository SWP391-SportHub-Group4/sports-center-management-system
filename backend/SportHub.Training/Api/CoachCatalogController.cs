using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
namespace SportHub.Training.Api;

public sealed class UpdateMyCoachProfileRequest
{
    [System.ComponentModel.DataAnnotations.MaxLength(1000)] public string? Bio { get; set; }
    [System.ComponentModel.DataAnnotations.MaxLength(100)] public string? Title { get; set; }
    [System.ComponentModel.DataAnnotations.Range(0, 60)] public int? YearsExperience { get; set; }
    [System.ComponentModel.DataAnnotations.Range(0, 100000)] public int? StudentCount { get; set; }
    [System.ComponentModel.DataAnnotations.MaxLength(1000)] public string? Philosophy { get; set; }
}
[ApiController, Route("api/coaches")]
public sealed class CoachCatalogController(ISportHubDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int? sportId, CancellationToken ct)
    {
        var query = db.Set<UserAccount>().AsNoTracking().Where(u => u.Role != null && u.Role.RoleName == UserRole.Coach && u.Status == UserStatus.Active && u.Profile != null);
        if (sportId is int id) query = query.Where(u => db.Set<UserSportSpecialty>().Any(s => s.UserId == u.UserId && s.SportId == id));
        return Ok(await query.OrderBy(u => u.Profile!.FullName).Take(500).Select(u => new {
            u.UserId, FullName = u.Profile!.FullName, AvatarUrl = u.Profile.AvatarUrl,
            Bio = u.CoachProfile != null ? u.CoachProfile.Bio : null,
            Title = u.CoachProfile != null ? u.CoachProfile.Title : null,
            YearsExperience = u.CoachProfile != null ? u.CoachProfile.YearsExperience : null,
            StudentCount = u.CoachProfile != null ? u.CoachProfile.StudentCount : null,
            Philosophy = u.CoachProfile != null ? u.CoachProfile.Philosophy : null,
            SportIds = db.Set<UserSportSpecialty>().Where(s => s.UserId == u.UserId).Select(s => s.SportId).ToArray(),
            SportNames = db.Set<Sport>().Where(s => db.Set<UserSportSpecialty>().Any(specialty => specialty.UserId == u.UserId && specialty.SportId == s.SportId))
                .OrderBy(s => s.Name).Select(s => s.Name).ToArray()
        }).ToListAsync(ct));
    }

    /// <summary>Coach tự xem hồ sơ công khai của mình.</summary>
    [Authorize(Roles = SportHubRoleNames.Coach)]
    [HttpGet("me/profile")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var id = User.RequireUserId();
        var p = await db.Set<CoachProfile>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == id, ct);
        return Ok(new { Bio = p?.Bio, Title = p?.Title, YearsExperience = p?.YearsExperience, StudentCount = p?.StudentCount, Philosophy = p?.Philosophy });
    }

    /// <summary>Coach tự sửa hồ sơ công khai (thay toàn bộ các trường; chuỗi rỗng xóa giá trị).</summary>
    [Authorize(Roles = SportHubRoleNames.Coach)]
    [HttpPut("me/profile")]
    public async Task<IActionResult> UpdateMine([FromBody] UpdateMyCoachProfileRequest request, CancellationToken ct)
    {
        var id = User.RequireUserId();
        var p = await db.Set<CoachProfile>().SingleOrDefaultAsync(x => x.UserId == id, ct);
        if (p is null) { p = new CoachProfile { UserId = id }; db.Set<CoachProfile>().Add(p); }
        static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        p.Bio = Clean(request.Bio);
        p.Title = Clean(request.Title);
        p.Philosophy = Clean(request.Philosophy);
        p.YearsExperience = request.YearsExperience;
        p.StudentCount = request.StudentCount;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
