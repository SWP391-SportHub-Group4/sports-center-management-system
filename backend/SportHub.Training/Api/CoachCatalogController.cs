using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
namespace SportHub.Training.Api;
[ApiController, Authorize, Route("api/coaches")]
public sealed class CoachCatalogController(ISportHubDbContext db) : ControllerBase
{
    [Authorize(Roles = SportHubRoleNames.Member + "," + SportHubRoleNames.Receptionist + "," + SportHubRoleNames.CenterManager)]
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int? sportId, CancellationToken ct)
    {
        var query = db.Set<UserAccount>().AsNoTracking().Where(u => u.Role != null && u.Role.RoleName == UserRole.Coach && u.Status == UserStatus.Active);
        if (sportId is int id) query = query.Where(u => db.Set<UserSportSpecialty>().Any(s => s.UserId == u.UserId && s.SportId == id));
        return Ok(await query.OrderBy(u => u.Profile!.FullName).Take(500).Select(u => new {
            u.UserId, FullName = u.Profile!.FullName, SportIds = db.Set<UserSportSpecialty>().Where(s => s.UserId == u.UserId).Select(s => s.SportId).ToArray()
        }).ToListAsync(ct));
    }
}
