using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.API.Controllers;

[ApiController, AllowAnonymous, Route("api/public/overview")]
public sealed class PublicOverviewController(SportHubDbContext db, IConfiguration configuration) : ControllerBase
{
    [HttpGet, ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var coaches = await db.UserAccounts.CountAsync(u => u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.Coach, ct);
        var members = await db.UserAccounts.CountAsync(u => u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.Member, ct);
        var facilities = await db.Rooms.Where(r => r.IsActive).OrderBy(r => r.Name)
            .Select(r => new { r.RoomId, r.Name, r.RoomTypeId, r.Capacity }).ToListAsync(ct);
        // Only public aggregate counts and facility metadata; never student profiles or member identities.
        return Ok(new { CoachCount = coaches, MemberCount = members, FacilityCount = facilities.Count, Facilities = facilities,
            Contact = new { Phone = configuration["PublicContact:Phone"], Email = configuration["PublicContact:Email"],
                Address = configuration["PublicContact:Address"], Hours = configuration["PublicContact:Hours"] } });
    }
}
