using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Scheduling.Application.Services;

internal static class ClassCancellationRules
{
    public static bool IsBelowThresholdDecision(Class course, int confirmedCount)
        => course.Status == ClassStatus.Published
           && course.ThresholdStatus == SportHub.Scheduling.Threshold.Domain.ThresholdStatus.AtRisk
           && course.BreakEvenThreshold is int minimum && confirmedCount < minimum;

    // Call after locking the class row; never rely on a cached ConfirmedCount or a preview token.
    public static async Task EnsureNoConfirmedEnrollmentsAsync(ISportHubDbContext db, int classId, CancellationToken ct)
    {
        if (await db.Set<Enrollment>().AnyAsync(e => e.ClassId == classId
            && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null, ct))
            throw new ConflictException("class_has_enrollments",
                "This class has enrolled students. Reschedule the session, change the room, or assign another coach instead.");
    }
}
