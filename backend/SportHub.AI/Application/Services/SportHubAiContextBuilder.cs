using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using System.Text.Json;
using SportHub.Scheduling.Application.Services;

namespace SportHub.AI.Application.Services;

public sealed class SportHubAiContextBuilder(
    ISportHubDbContext db,
    IClock clock) : IAiContextBuilder
{
    private const int UpcomingWindowDays = 14;
    private const int MaxUpcomingSessions = 30;

    public async Task<string> BuildAsync(
        Guid userId,
        string question,
        CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var until = now.AddDays(UpcomingWindowDays);

        var member = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking()
            .Where(u => u.UserId == userId)
            .Select(u => new
            {
                name = u.Profile != null
                    ? u.Profile.FullName
                    : u.Email,

                email = u.Email
            })
            .SingleOrDefaultAsync(cancellationToken);

        var activeMemberPackages = await db.Set<MemberPackage>()
            .AsNoTracking()
            .Where(mp =>
                mp.MemberId == userId &&
                mp.Status == MemberPackageStatus.Active)
            .OrderBy(mp => mp.EndDate)
            .Select(mp => new
            {
                packageName = mp.Package != null
                    ? mp.Package.Name
                    : "Unknown",

                mp.StartDate,
                mp.EndDate,
                mp.RemainingSessions
            })
            .ToListAsync(cancellationToken);

        var packageCatalog = await db.Set<MembershipPackage>()
            .AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.Price)
            .Select(p => new
            {
                p.PackageId,
                p.Name,
                p.Price,
                p.DurationDays,
                p.SessionLimit,
                p.Description
            })
            .ToListAsync(cancellationToken);

        var currentEnrollments = MemberClassAccess.Current(db, userId, now);
        var healthProfile = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .Where(p => p.MemberId == userId)
            .Select(p => new { p.Goal, p.GoalType, p.ExperienceLevel, p.HeightCm, p.WeightKg, p.BodyBuild,
                p.TargetWeightKg, p.ActivityLevel, p.TrainingDaysPerWeek, p.SessionMinutes, p.Notes,
                p.DietaryPreference, p.FoodAllergies, p.UpdatedAt }).SingleOrDefaultAsync(cancellationToken);
        var teachingQuery = (from r in db.Set<ClassTeachingRecord>().AsNoTracking()
                              join c in db.Set<Class>() on r.ClassId equals c.ClassId
                              join s in db.Set<ClassSession>() on r.SessionId equals s.SessionId into sessions
                              from s in sessions.DefaultIfEmpty()
                              where currentEnrollments.Any(e => e.ClassId == r.ClassId)
                                  && (r.MemberId == null || r.MemberId == userId)
                              orderby r.UpdatedAtUtc descending, r.RecordId
                              select new { r.RecordId, r.ClassId, ClassName = c.Name, r.SessionId,
                                  SessionStartAtUtc = s == null ? (DateTime?)null : s.StartAtUtc,
                                  r.MemberId, r.CoachId, r.Kind, r.Title, r.Content, r.Score, r.UpdatedAtUtc });
        var plans = await teachingQuery.Where(r => r.Kind == "PLAN")
            .OrderBy(r => r.SessionStartAtUtc >= now ? 0 : r.SessionId == null ? 1 : 2)
            .ThenBy(r => r.SessionStartAtUtc >= now ? r.SessionStartAtUtc : null)
            .ThenByDescending(r => r.UpdatedAtUtc).Take(12).ToListAsync(cancellationToken);
        var feedback = await teachingQuery.Where(r => r.Kind == "RESULT").Take(16).ToListAsync(cancellationToken);
        var otherTeaching = await teachingQuery.Where(r => r.Kind == "HOMEWORK" || r.Kind == "NOTICE")
            .Take(8).ToListAsync(cancellationToken);
        var teaching = plans.Concat(feedback).Concat(otherTeaching);
        // Bounded excerpts retain source IDs/dates so advice can cite the actual lesson or assessment.
        var memberTeaching = teaching.Select(r => new { r.RecordId, r.ClassId, r.ClassName, r.SessionId,
            r.SessionStartAtUtc, r.CoachId, r.Kind, r.Title,
            Content = r.Content.Length > 2000 ? r.Content[..2000] : r.Content, ContentTruncated = r.Content.Length > 2000, r.Score, r.UpdatedAtUtc });
        var attendance = await db.Set<Attendance>().AsNoTracking()
            .Where(a => a.Enrollment!.MemberId == userId)
            .GroupBy(a => a.Status).Select(g => new { Status = g.Key.ToString(), Count = g.Count() })
            .ToListAsync(cancellationToken);

        var upcomingSessions = await db.Set<ClassSession>()
            .AsNoTracking()
            .Where(s =>
                currentEnrollments.Any(e => e.ClassId == s.ClassId) &&
                s.StartAtUtc >= now &&
                s.StartAtUtc <= until &&
                s.Status == ClassSessionStatus.Scheduled)
            .OrderBy(s => s.StartAtUtc)
            .Take(MaxUpcomingSessions)
            .Select(s => new
            {
                s.SessionId,

                className = s.Class != null
                    ? s.Class.Name
                    : "Unknown",

                sport = s.Class != null && s.Class.Sport != null
                    ? s.Class.Sport.Name
                    : "Unknown",

                room = s.Room != null
                    ? s.Room.Name
                    : "Unknown",

                s.CoachId,

                s.StartAtUtc,
                s.EndAtUtc,
                capacity = s.Class != null ? s.Class.Capacity : 0,
                confirmedCount = s.Class != null ? s.Class.ConfirmedCount : 0,

                availableSeats = s.Class != null && s.Class.Capacity - s.Class.ReservedCount > 0
                    ? s.Class.Capacity - s.Class.ReservedCount
                    : 0,

                isMakeup = s.IsMakeup
            })
            .ToListAsync(cancellationToken);

        var accessScope = await currentEnrollments.OrderBy(e => e.ClassId).Select(e => new { e.ClassId, e.EnrollmentId }).ToListAsync(cancellationToken);
        var context = new
        {
            generatedAtUtc = now,
            accessScope,

            contextWindow = new
            {
                upcomingClassesFromUtc = now,
                upcomingClassesToUtc = until,
                maxSessionsReturned = MaxUpcomingSessions,
                maxPlans = 12, maxAssessments = 16, maxNoticesAndHomework = 8, maxExcerptCharacters = 2000
            },

            member = member is null
                ? null
                : new
                {
                    member.name,
                    member.email,
                    activePackages = activeMemberPackages
                },

            healthProfile,
            memberTeaching,
            attendance,
            activeMembershipCatalog = packageCatalog,

            upcomingClassSessions = upcomingSessions,

            note =
                "This is a read-only snapshot. Absence from this context means the assistant must not invent the value."
        };

        return JsonSerializer.Serialize(context);
    }
}