using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Qualification dịch vụ của Coach nội bộ (CAT-01). Hiện chỉ dịch vụ PT của Gym cần qualification riêng; Coach phải
/// đã có chuyên môn môn Gym. Gỡ qualification khi Coach còn lịch PT tương lai chưa được kiểm ở đây (module Training
/// sở hữu dữ liệu đó) và hiện chưa được cài đặt.
/// </summary>
public sealed class CoachQualificationService(ISportHubDbContext db, ISportCatalogReader catalog, IAuditWriter audit)
{
    public async Task<IReadOnlyList<int>> GetAsync(Guid coachId, CancellationToken ct)
        => await db.Set<CoachServiceQualification>().AsNoTracking()
            .Where(q => q.UserId == coachId)
            .Select(q => q.OfferingId)
            .OrderBy(id => id)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<int>> ReplaceAsync(Guid coachId, IEnumerable<int> offeringIds, Guid actorUserId, CancellationToken ct)
    {
        var coach = await db.Set<UserAccount>().AsNoTracking()
            .SingleOrDefaultAsync(u => u.UserId == coachId && u.Role!.RoleName == UserRole.Coach, ct)
            ?? throw new NotFoundException("coach_not_found", "Không tìm thấy Coach.");
        var ids = offeringIds.Distinct().OrderBy(x => x).ToList();

        if (ids.Count > 0)
        {
            var pt = await catalog.GetSportForServiceAsync(SportServiceType.PersonalTraining, ct)
                     ?? throw new BadRequestException("service_not_enabled", "Dịch vụ PT đang tắt.");
            var ptOffering = pt.Services.Single(s => s.ServiceType == SportServiceType.PersonalTraining);

            if (ids.Any(id => id != ptOffering.OfferingId))
            {
                throw new BadRequestException("qualification_not_supported", "Hiện chỉ dịch vụ PT cần qualification riêng.");
            }

            if (!await db.Set<UserSportSpecialty>().AnyAsync(s => s.UserId == coachId && s.SportId == pt.SportId, ct))
            {
                throw new BadRequestException("coach_missing_sport_specialty", "Coach phải có chuyên môn môn Gym trước khi nhận qualification PT.");
            }
        }

        var current = await db.Set<CoachServiceQualification>().Where(q => q.UserId == coach.UserId).ToListAsync(ct);
        var before = current.Select(q => q.OfferingId).OrderBy(x => x).ToList();
        db.Set<CoachServiceQualification>().RemoveRange(current.Where(q => !ids.Contains(q.OfferingId)));
        db.Set<CoachServiceQualification>().AddRange(ids.Where(id => current.All(q => q.OfferingId != id))
            .Select(id => new CoachServiceQualification { UserId = coach.UserId, OfferingId = id }));

        audit.Write(new AuditEntry(actorUserId, "SET_COACH_SERVICE_QUALIFICATIONS", nameof(CoachServiceQualification), coachId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { offeringIds = before }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { offeringIds = ids })));
        await db.SaveChangesAsync(ct);
        return ids;
    }
}
