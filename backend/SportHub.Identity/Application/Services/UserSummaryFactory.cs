using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Services;

/// <summary>Dựng <see cref="UserSummaryResponse"/> cho phản hồi đăng nhập, kèm chuyên môn và trạng thái duyệt đọc từ DB.</summary>
public interface IUserSummaryFactory
{
    Task<UserSummaryResponse> BuildAsync(UserAccount user, CancellationToken ct);
}

public sealed class UserSummaryFactory(ISportHubDbContext db) : IUserSummaryFactory
{
    public async Task<UserSummaryResponse> BuildAsync(UserAccount user, CancellationToken ct)
    {
        var role = user.Role!.RoleName;

        string? approval = null;
        IReadOnlyList<int> sportIds = [];

        if (role is UserRole.Coach or UserRole.ExternalCoach)
        {
            sportIds = await db.Set<UserSportSpecialty>()
                .AsNoTracking()
                .Where(s => s.UserId == user.UserId)
                .Select(s => s.SportId)
                .OrderBy(id => id)
                .ToListAsync(ct);
        }

        if (role == UserRole.ExternalCoach)
        {
            approval = (await db.Set<ExternalCoachProfile>()
                    .AsNoTracking()
                    .Where(p => p.UserId == user.UserId)
                    .Select(p => (ExternalCoachApprovalStatus?)p.ApprovalStatus)
                    .SingleOrDefaultAsync(ct))
                ?.ToString();
        }

        return new UserSummaryResponse
        {
            UserId = user.UserId,
            Email = user.Email,
            FullName = user.Profile?.FullName ?? string.Empty,
            Role = role.ToString(),
            ApprovalStatus = approval,
            SportIds = sportIds
        };
    }
}
