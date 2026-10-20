using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Domain.Rules;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Persistence;

/// <summary>
/// Test fixture: a badminton course that already started on 15/10/2026 (Tue/Thu/Sat 06:00, 120 minutes), so the team can
/// check that members cannot enrol mid-course and what the course costs. Publishing through the class service would be
/// rejected (first_session_in_past), so rows are written directly, mirroring what publish + ClassStatusJob produce.
/// Reuses the BR-141 room/coach; the seed never overwrites an existing class code.
/// </summary>
public sealed class StartedClassSeeder(SportHubDbContext db, IClock clock, ILogger<StartedClassSeeder> logger)
{
    private const string Code = "CAULONG-STARTED-01";
    private const string RoomName = "Badminton Class BC1";
    private const string CoachEmail = "coach.caulong@sporthub.vn";
    private static readonly DateOnly StartDate = new(2026, 10, 15);
    private static readonly TimeOnly StartTime = new(6, 0);

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (await db.Classes.AnyAsync(c => c.Code == Code, ct))
        {
            logger.LogInformation("{Code} already exists; nothing changed.", Code);
            return;
        }

        var sport = await db.Set<Sport>().Include(s => s.Services).SingleOrDefaultAsync(s => s.Code == "badminton", ct)
            ?? throw new InvalidOperationException("Badminton sport not found.");
        var minutes = sport.Services.SingleOrDefault(s => s.ServiceType == SportServiceType.GroupCourse && s.IsEnabled)
            ?.DefaultSessionMinutes ?? throw new InvalidOperationException("Enable group courses for badminton first.");
        var room = await db.Rooms.SingleOrDefaultAsync(r => r.Name == RoomName, ct)
            ?? throw new InvalidOperationException($"Room '{RoomName}' not found. Run the BR-141 seed first.");
        var coachId = await db.UserAccounts.Where(u => u.Email == CoachEmail && u.Status == UserStatus.Active)
            .Select(u => (Guid?)u.UserId).SingleOrDefaultAsync(ct)
            ?? throw new InvalidOperationException($"Coach '{CoachEmail}' not found. Run the BR-141 seed first.");
        var managerId = await db.UserAccounts.Where(u => u.Role != null && u.Role.RoleName == UserRole.CenterManager)
            .OrderBy(u => u.CreatedAt).Select(u => (Guid?)u.UserId).FirstOrDefaultAsync(ct);

        var days = new[] { 2, 4, 6 };
        var generated = CourseRules.GenerateSessions(StartDate, 12,
            days.Select(d => (d, StartTime)).ToArray(), minutes);
        var now = clock.UtcNow;
        var openedAt = new DateTime(2026, 10, 1, 3, 0, 0, DateTimeKind.Utc);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var course = new Class
        {
            Code = Code, Name = "Badminton 03", SportId = sport.SportId, CoachId = coachId,
            DefaultRoomId = room.RoomId, StartDate = StartDate, NumSessions = 12,
            Capacity = Math.Min(sport.Services.Single(s => s.ServiceType == SportServiceType.GroupCourse).DefaultMaxCapacity ?? room.Capacity, room.Capacity),
            Price = 900_000m, CostAmount = 4_500_000m, BreakEvenThreshold = 5,
            ThresholdStatus = ThresholdStatus.WaivedByManager,
            ThresholdDeadlineUtc = generated[0].StartAtUtc.AddDays(-3),
            Status = ClassStatus.InProgress, EnrollmentOpen = true, Version = 3,
            CreatedAt = openedAt, PublishedAt = openedAt
        };
        db.Classes.Add(course);
        await db.SaveChangesAsync(ct);

        db.ClassScheduleRules.AddRange(days.Select(d => new ClassScheduleRule
            { ClassId = course.ClassId, DayOfWeek = d, StartTimeLocal = StartTime }));
        var sessions = generated.Select(g => new ClassSession
        {
            SessionId = Guid.NewGuid(), ClassId = course.ClassId, SessionNo = g.SessionNo, RoomId = room.RoomId,
            CoachId = coachId, StartAtUtc = g.StartAtUtc, EndAtUtc = g.EndAtUtc,
            Status = g.EndAtUtc <= now ? ClassSessionStatus.Completed : ClassSessionStatus.Scheduled
        }).ToList();
        db.ClassSessions.AddRange(sessions);
        db.RoomOccupancies.AddRange(sessions.Select(s => new RoomOccupancy
        {
            OccupancyId = Guid.NewGuid(), RoomId = s.RoomId, SourceType = OccupancySourceType.ClassSession,
            SourceId = s.SessionId, StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
        }));
        db.CoachOccupancies.AddRange(sessions.Select(s => new CoachOccupancy
        {
            OccupancyId = Guid.NewGuid(), CoachId = s.CoachId, SourceType = OccupancySourceType.ClassSession,
            SourceId = s.SessionId, StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
        }));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        logger.LogInformation("Seeded {Code}: {Count} sessions from {First:o}, {Minutes} minutes each.",
            Code, sessions.Count, generated[0].StartAtUtc, minutes);
    }
}
