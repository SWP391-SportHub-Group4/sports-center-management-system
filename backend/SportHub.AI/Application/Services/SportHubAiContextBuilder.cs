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