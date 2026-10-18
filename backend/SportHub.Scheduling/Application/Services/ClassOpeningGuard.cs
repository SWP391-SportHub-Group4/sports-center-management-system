using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Application.Services;

internal static class ClassOpeningGuard
{
    public static async Task RequireAsync(ISportHubDbContext db, Class course, CancellationToken ct)
    {
        if (course.Status != ClassStatus.Published
            || course.ThresholdStatus is ThresholdStatus.Met or ThresholdStatus.WaivedByManager) return;
        var confirmed = await db.Set<Enrollment>().CountAsync(e => e.ClassId == course.ClassId
            && e.Status == EnrollmentStatus.Confirmed, ct);
        if (course.BreakEvenThreshold is int minimum && confirmed >= minimum) return;
        throw new ConflictException("class_opening_not_confirmed",
            "This class has not been confirmed to run. Manager must resolve its enrollment threshold before teaching starts.");
    }
}
