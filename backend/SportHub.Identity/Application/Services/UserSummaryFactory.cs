using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Services;

/// <summary>Dựng <see cref="UserSummaryResponse"/> cho phản hồi đăng nhập, kèm chuyên môn và trạng thái duyệt đọc từ DB.</summary>
public interface IUserSummaryFactory
{
    Task<UserSummaryResponse> BuildAsync(UserAccount user, CancellationToken ct);
}

public sealed class UserSummaryFactory(ISportHubDbContext db, ISportCatalogReader catalog) : IUserSummaryFactory
{
    public async Task<UserSummaryResponse> BuildAsync(UserAccount user, CancellationToken ct)
    {
        var role = user.Role!.RoleName;

        IReadOnlyList<int> sportIds = [];

        if (role == UserRole.Coach)
        {
            sportIds = await db.Set<UserSportSpecialty>()
                .AsNoTracking()
                .Where(s => s.UserId == user.UserId)
                .Select(s => s.SportId)
                .OrderBy(id => id)
                .ToListAsync(ct);
        }

        var isPersonalTrainer = false;
        if (role == UserRole.Coach)
        {
            var offering = (await catalog.GetSportForServiceAsync(SportServiceType.PersonalTraining, ct))
                ?.Services.FirstOrDefault(s => s.ServiceType == SportServiceType.PersonalTraining);
            isPersonalTrainer = offering is not null
                && await db.Set<CoachServiceQualification>().AsNoTracking()
                    .AnyAsync(q => q.UserId == user.UserId && q.OfferingId == offering.OfferingId, ct);
        }

        return new UserSummaryResponse
        {
            UserId = user.UserId,
            Email = user.Email,
            FullName = user.Profile?.FullName ?? string.Empty,
            AvatarUrl = user.Profile?.AvatarUrl,
            Role = role.ToString(),
            SportIds = sportIds,
            IsPersonalTrainer = isPersonalTrainer
        };
    }
}
