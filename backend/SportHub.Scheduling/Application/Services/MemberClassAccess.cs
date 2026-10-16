using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Scheduling.Application.Services;

/// <summary>The same current-enrollment boundary is used by teaching APIs and AI context.</summary>
public static class MemberClassAccess
{
    public static IQueryable<Enrollment> Current(ISportHubDbContext db, Guid memberId, DateTime now)
        => db.Set<Enrollment>().Where(e => e.MemberId == memberId
            && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
            && (e.Class!.Status == ClassStatus.Published || e.Class.Status == ClassStatus.InProgress)
            && db.Set<ClassSession>().Any(s => s.ClassId == e.ClassId
                && s.Status != ClassSessionStatus.Cancelled && s.EndAtUtc > now));

    public static async Task RequireAsync(ISportHubDbContext db, Guid memberId, int classId, DateTime now, CancellationToken ct)
    {
        if (!await Current(db, memberId, now).AnyAsync(e => e.ClassId == classId, ct))
            throw new ForbiddenException("class_access_ended", "Class access has ended or you are not currently enrolled.");
    }
}
