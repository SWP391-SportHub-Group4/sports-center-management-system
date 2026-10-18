using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Scheduling.Application.Services;

/// <summary>Student profiles belong to current class assignments, never to a stale relationship row.</summary>
public static class CoachDataScope
{
    public static IQueryable<Class> Classes(ISportHubDbContext db, Guid coachId) => db.Set<Class>().AsNoTracking()
        .Where(c => c.CoachId == coachId && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress));

    public static IQueryable<Enrollment> Enrollments(ISportHubDbContext db, Guid coachId)
    {
        var classes = Classes(db, coachId);
        return db.Set<Enrollment>().AsNoTracking().Where(e => e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
            && classes.Any(c => c.ClassId == e.ClassId));
    }

    public static Task<bool> CanReadMemberAsync(ISportHubDbContext db, Guid coachId, Guid memberId, CancellationToken ct)
        => Enrollments(db, coachId).AnyAsync(e => e.MemberId == memberId, ct);
}
