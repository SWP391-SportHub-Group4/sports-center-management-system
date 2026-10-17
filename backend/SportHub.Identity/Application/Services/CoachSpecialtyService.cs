using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// Gán chuyên môn (môn dạy) cho tài khoản Coach nội bộ (BR-96), thay CoachCategory. Dùng chung cho SysAdmin tạo/đổi vai trò Coach
/// và Manager quản lý Coach. Chỉ thay đổi change tracker của caller — caller gọi SaveChanges cùng audit trong một transaction.
/// </summary>
public sealed class CoachSpecialtyService(ISportHubDbContext db, ISportCatalogReader catalog)
{
    public const int MaxSports = 10;

    /// <summary>Bắt buộc 1–10 môn, không trùng; mọi môn phải tồn tại, đang hoạt động và có lớp nhóm (GroupCourse) đang bật.</summary>
    public async Task<IReadOnlyList<int>> ValidateAsync(IEnumerable<int>? sportIds, CancellationToken ct)
    {
        var ids = (sportIds ?? []).Distinct().OrderBy(x => x).ToList();

        if (ids.Count == 0)
        {
            throw new BadRequestException(
                "coach_specialty_required", "Coach specialty required.");
        }

        if (ids.Count > MaxSports)
        {
            throw new BadRequestException("too_many_sports", $"A coach can have at most {MaxSports} sport specialties.");
        }

        foreach (var id in ids)
        {
            var sport = await catalog.GetSportAsync(id, ct);

            if (sport is null || !sport.IsActive)
            {
                throw new BadRequestException("invalid_sport", "Invalid sport.");
            }

            // Coaches only teach group courses. Gym (membership access) and rental-only sports have no coach, and a
            // sport added later becomes coachable as soon as its GroupCourse service is enabled.
            if (!sport.HasEnabledService(SportServiceType.GroupCourse))
            {
                throw new BadRequestException("sport_not_coachable", "This sport has no coached courses.");
            }
        }

        return ids;
    }

    /// <summary>Thay toàn bộ chuyên môn của user bằng danh sách đã validate. Trả danh sách cũ để ghi audit.</summary>
    public async Task<IReadOnlyList<int>> ReplaceAsync(Guid userId, IReadOnlyList<int> sportIds, CancellationToken ct)
    {
        var current = await db.Set<UserSportSpecialty>().Where(s => s.UserId == userId).ToListAsync(ct);

        db.Set<UserSportSpecialty>().RemoveRange(current.Where(s => !sportIds.Contains(s.SportId)));
        db.Set<UserSportSpecialty>().AddRange(sportIds
            .Where(id => current.All(s => s.SportId != id))
            .Select(id => new UserSportSpecialty { UserId = userId, SportId = id }));

        return current.Select(s => s.SportId).OrderBy(x => x).ToList();
    }

    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<int>>> GetForUsersAsync(IReadOnlyCollection<Guid> userIds, CancellationToken ct)
    {
        var rows = await db.Set<UserSportSpecialty>().AsNoTracking()
            .Where(s => userIds.Contains(s.UserId))
            .Select(s => new { s.UserId, s.SportId })
            .ToListAsync(ct);

        return rows.GroupBy(r => r.UserId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<int>)g.Select(r => r.SportId).OrderBy(x => x).ToList());
    }
}
