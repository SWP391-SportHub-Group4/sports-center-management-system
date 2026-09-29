using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.Identity.Application.Services;

/// <summary>Bản cài đặt <see cref="IUserAccessReader"/>: chỉ đọc, trả dữ liệu tối thiểu.</summary>
public sealed class UserAccessReader(ISportHubDbContext db) : IUserAccessReader
{
    public async Task<UserAccessInfo?> GetAsync(Guid userId, CancellationToken cancellationToken = default)
        => await db.Set<UserAccount>()
            .AsNoTracking()
            .Where(u => u.UserId == userId)
            .Select(u => new UserAccessInfo(
                u.UserId,
                u.Role!.RoleName.ToString(),
                u.Status == UserStatus.Active,
                u.Email,
                u.Profile != null ? u.Profile.FullName : string.Empty))
            .SingleOrDefaultAsync(cancellationToken);
}

/// <summary>Bản cài đặt <see cref="ICoachSpecialtyReader"/>: chuyên môn theo UserSportSpecialty, thay CoachCategory.</summary>
public sealed class CoachSpecialtyReader(ISportHubDbContext db, ISportCatalogReader catalog) : ICoachSpecialtyReader
{
    public Task<bool> IsActiveInternalCoachAsync(Guid coachId, CancellationToken cancellationToken = default)
        => db.Set<UserAccount>()
            .AsNoTracking()
            .AnyAsync(
                u => u.UserId == coachId && u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.Coach,
                cancellationToken);

    public Task<bool> HasSportAsync(Guid coachId, int sportId, CancellationToken cancellationToken = default)
        => db.Set<UserSportSpecialty>()
            .AsNoTracking()
            .AnyAsync(s => s.UserId == coachId && s.SportId == sportId, cancellationToken);

    public async Task<bool> IsPersonalTrainerAsync(Guid coachId, CancellationToken cancellationToken = default)
    {
        if (!await IsActiveInternalCoachAsync(coachId, cancellationToken))
        {
            return false;
        }

        foreach (var sportId in await GetSportIdsAsync(coachId, cancellationToken))
        {
            var sport = await catalog.GetSportAsync(sportId, cancellationToken);

            if (sport is { IsActive: true, OperationType: "OneOnOne" })
            {
                return true;
            }
        }

        return false;
    }

    public async Task<IReadOnlyList<Guid>> GetCoachIdsForSportAsync(int sportId, CancellationToken cancellationToken = default)
        => await db.Set<UserSportSpecialty>()
            .AsNoTracking()
            .Where(s => s.SportId == sportId
                        && s.UserAccount!.Status == UserStatus.Active
                        && s.UserAccount.Role!.RoleName == UserRole.Coach)
            .Select(s => s.UserId)
            .OrderBy(id => id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<int>> GetSportIdsAsync(Guid coachId, CancellationToken cancellationToken = default)
        => await db.Set<UserSportSpecialty>()
            .AsNoTracking()
            .Where(s => s.UserId == coachId)
            .Select(s => s.SportId)
            .OrderBy(id => id)
            .ToListAsync(cancellationToken);
}

/// <summary>Bản cài đặt <see cref="IExternalCoachAccessReader"/>: Approved + tài khoản Active + đúng môn mới được thuê sân.</summary>
public sealed class ExternalCoachAccessReader(ISportHubDbContext db) : IExternalCoachAccessReader
{
    public async Task<ExternalCoachAccess?> GetAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var row = await db.Set<ExternalCoachProfile>()
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => new { p.ApprovalStatus, Active = p.UserAccount!.Status == UserStatus.Active })
            .SingleOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        var sportIds = await db.Set<UserSportSpecialty>()
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => s.SportId)
            .OrderBy(id => id)
            .ToListAsync(cancellationToken);

        return new ExternalCoachAccess(userId, row.ApprovalStatus.ToString(), row.Active, sportIds);
    }

    public async Task<bool> CanRentForSportAsync(Guid userId, int sportId, CancellationToken cancellationToken = default)
    {
        var access = await GetAsync(userId, cancellationToken);

        return access is { IsAccountActive: true }
               && access.ApprovalStatus == nameof(ExternalCoachApprovalStatus.Approved)
               && access.SportIds.Contains(sportId);
    }
}
