using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using System.Text.Json;

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

        var upcomingSessions = await db.Set<ClassSession>()
            .AsNoTracking()
            .Where(s =>
                s.StartAtUtc >= now &&
                s.StartAtUtc <= until &&
                (
                    s.Status == ClassSessionStatus.Scheduled ||
                    s.Status == ClassSessionStatus.Rescheduled
                ))
            .OrderBy(s => s.StartAtUtc)
            .Take(MaxUpcomingSessions)
            .Select(s => new
            {
                s.SessionId,

                className = s.Class != null
                    ? s.Class.Name
                    : "Unknown",

                discipline = s.Class != null
                    ? s.Class.Discipline
                    : "Unknown",

                room = s.Room != null
                    ? s.Room.Name
                    : "Unknown",

                coach =
                    s.Coach != null &&
                    s.Coach.Profile != null
                        ? s.Coach.Profile.FullName
                        : s.Coach != null
                            ? s.Coach.Email
                            : "Unknown",

                s.StartAtUtc,
                s.EndAtUtc,
                s.Capacity,
                s.ConfirmedCount,

                availableSeats =
                    s.Capacity - s.ConfirmedCount > 0
                        ? s.Capacity - s.ConfirmedCount
                        : 0,

                isRescheduled =
                    s.Status == ClassSessionStatus.Rescheduled
            })
            .ToListAsync(cancellationToken);

        var context = new
        {
            generatedAtUtc = now,

            contextWindow = new
            {
                upcomingClassesFromUtc = now,
                upcomingClassesToUtc = until,
                maxSessionsReturned = MaxUpcomingSessions
            },

            member = member is null
                ? null
                : new
                {
                    member.name,
                    member.email,
                    activePackages = activeMemberPackages
                },

            activeMembershipCatalog = packageCatalog,

            upcomingClassSessions = upcomingSessions,

            note =
                "This is a read-only snapshot. Absence from this context means the assistant must not invent the value."
        };

        return JsonSerializer.Serialize(context);
    }
}