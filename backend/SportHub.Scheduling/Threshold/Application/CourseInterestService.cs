using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Application;

public sealed class CourseInterestService(ISportHubDbContext db, IClock clock)
{
    public async Task<PagedResult<CourseInterestRow>> SearchAsync(Guid? memberId, int? sportId,
        bool? active, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from interest in db.Set<CourseInterestSubscription>().AsNoTracking()
                    join source in db.Set<Class>().AsNoTracking() on interest.SourceClassId equals source.ClassId
                    join sport in db.Set<Sport>().AsNoTracking() on interest.SportId equals sport.SportId
                    join member in db.Set<UserAccount>().AsNoTracking() on interest.MemberId equals member.UserId
                    select new { interest, source, sport, member };
        if (memberId is Guid owner) query = query.Where(x => x.interest.MemberId == owner);
        if (sportId is int sportFilter) query = query.Where(x => x.interest.SportId == sportFilter);
        if (active is bool activeFilter) query = query.Where(x => x.interest.IsActive == activeFilter);
        return new PagedResult<CourseInterestRow>
        {
            Page = page, PageSize = pageSize, TotalCount = await query.CountAsync(ct),
            Items = await query.OrderByDescending(x => x.interest.CreatedAtUtc)
                .ThenBy(x => x.interest.SubscriptionId).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new CourseInterestRow(x.interest.SubscriptionId, x.interest.MemberId,
                    x.member.Profile != null ? x.member.Profile.FullName : x.member.Email,
                    x.interest.SourceClassId, x.source.Name, x.interest.SportId, x.sport.Name,
                    x.interest.RefundedPoints, x.interest.IsActive, x.interest.CreatedAtUtc,
                    x.interest.UnsubscribedAtUtc)).ToListAsync(ct)
        };
    }

    public async Task UnsubscribeAsync(Guid subscriptionId, Guid memberId, CancellationToken ct)
    {
        var interest = await db.Set<CourseInterestSubscription>()
            .SingleOrDefaultAsync(x => x.SubscriptionId == subscriptionId && x.MemberId == memberId, ct)
            ?? throw new NotFoundException("course_interest_not_found", "Không tìm thấy nguyện vọng khóa sau.");
        if (!interest.IsActive) return;
        interest.IsActive = false;
        interest.UnsubscribedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}

public sealed record CourseInterestRow(Guid SubscriptionId, Guid MemberId, string MemberName,
    int SourceClassId, string SourceClassName, int SportId, string SportName,
    int RefundedPoints, bool IsActive, DateTime CreatedAtUtc, DateTime? UnsubscribedAtUtc);
