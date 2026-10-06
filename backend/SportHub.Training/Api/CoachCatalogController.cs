using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
namespace SportHub.Training.Api;
[ApiController, Authorize, Route("api/coaches")]
public sealed class CoachCatalogController(ISportHubDbContext db, ISportCatalogReader catalog) : ControllerBase
{
    [Authorize(Roles = SportHubRoleNames.Member + "," + SportHubRoleNames.Receptionist + "," + SportHubRoleNames.CenterManager)]
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int? sportId, [FromQuery] string? service, CancellationToken ct)
    {
        // service=PERSONAL_TRAINING: chỉ Coach có qualification dịch vụ PT, không phải mọi Coach có chuyên môn Gym.
        int? requiredOfferingId = null;
        if (!string.IsNullOrWhiteSpace(service))
        {
            if (!WireEnum.TryParse<SportServiceType>(service, ignoreCase: true, out var parsed) || parsed != SportServiceType.PersonalTraining)
            {
                throw new SportHub.BuildingBlocks.SharedKernel.Errors.BadRequestException("service_type_invalid", "Chỉ hỗ trợ lọc theo PERSONAL_TRAINING.");
            }

            var offering = (await catalog.GetSportForServiceAsync(parsed, ct))?.Services.FirstOrDefault(s => s.ServiceType == parsed);
            if (offering is null) return Ok(Array.Empty<object>());
            requiredOfferingId = offering.OfferingId;
        }

        var query = db.Set<UserAccount>().AsNoTracking().Where(u => u.Role != null && u.Role.RoleName == UserRole.Coach && u.Status == UserStatus.Active);
        if (requiredOfferingId is int offeringId) query = query.Where(u => db.Set<CoachServiceQualification>().Any(q => q.UserId == u.UserId && q.OfferingId == offeringId));
        if (sportId is int id) query = query.Where(u => db.Set<UserSportSpecialty>().Any(s => s.UserId == u.UserId && s.SportId == id));
        return Ok(await query.OrderBy(u => u.Profile!.FullName).Take(500).Select(u => new {
            u.UserId, FullName = u.Profile!.FullName, SportIds = db.Set<UserSportSpecialty>().Where(s => s.UserId == u.UserId).Select(s => s.SportId).ToArray()
        }).ToListAsync(ct));
    }
}
