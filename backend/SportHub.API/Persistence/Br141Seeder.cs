using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.API.Persistence;

/// <summary>Explicit BR-141 setup. Existing operational records are never rewritten.</summary>
public sealed class Br141Seeder(SportHubDbContext db, IClassService classes, IPasswordHasher passwords,
    IClock clock, IConfiguration configuration, ILogger<Br141Seeder> logger, RoomOpeningHourService openingHours)
{
    private sealed record Plan(string Code, string Name, string Sport, string Room, int RoomCapacity,
        int[] Days, string Time, decimal Price, decimal Cost, string CoachEmail);

    private static readonly int[] MonWedFri = [1, 3, 5];
    private static readonly int[] TueThuSat = [2, 4, 6];
    private static readonly Plan[] Plans =
    [
        new("BR141-BONGRO-01", "Bóng rổ 01", "basketball", "Basketball Class KC1", 20,
            MonWedFri, "07:00", 1_200_000, 9_600_000, "coach.bongro@sporthub.vn"),
        new("BR141-BONGRO-02", "Bóng rổ 02", "basketball", "Basketball Class KC2", 20,
            TueThuSat, "14:00", 1_200_000, 9_600_000, "coach.bongro2@sporthub.vn"),
        new("BR141-CAULONG-01", "Cầu lông 01", "badminton", "Badminton Class BC1", 12,
            MonWedFri, "07:00", 900_000, 4_500_000, "coach.caulong@sporthub.vn"),
        new("BR141-CAULONG-02", "Cầu lông 02", "badminton", "Badminton Class BC2", 12,
            TueThuSat, "14:00", 900_000, 4_500_000, "coach.caulong2@sporthub.vn")
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var codes = Plans.Select(p => p.Code).ToArray();
        var existing = await db.Classes.AsNoTracking().Where(c => codes.Contains(c.Code)).ToListAsync(ct);
        // A failed publication leaves its draft for a manager to inspect, rather than silently modifying it.
        if (existing.FirstOrDefault(c => c.Status == ClassStatus.Draft) is { } draft)
            throw new InvalidOperationException($"{draft.Code} already exists as a draft. Review and publish it in class management before rerunning; the seed never overwrites existing classes.");
        var pending = Plans.Where(p => existing.All(c => c.Code != p.Code)).ToArray();
        if (pending.Length == 0)
        {
            logger.LogInformation("BR-141: all four class codes already exist. Existing classes and settings preserved.");
            return;
        }
        var managerId = await db.UserAccounts.Where(u => u.Role != null
                && u.Role.RoleName == UserRole.CenterManager && u.Status == UserStatus.Active)
            .OrderBy(u => u.CreatedAt).Select(u => (Guid?)u.UserId).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("BR-141 requires an active Center Manager. Create or activate one before seeding.");
        var sports = await db.Set<Sport>().Include(s => s.Services).ToDictionaryAsync(s => s.Code, ct);
        var rooms = new Dictionary<string, Room>();
        var coaches = new Dictionary<string, Guid>();
        var monday = VietnamTime.TodayLocal(clock).AddDays(8);
        while (monday.DayOfWeek != DayOfWeek.Monday) monday = monday.AddDays(1);

        // Dependency setup is atomic. Publishing then uses the real class service's own transactions.
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            foreach (var code in pending.Select(p => p.Sport).Distinct())
            {
                if (!sports.TryGetValue(code, out var sport) || !sport.IsActive
                    || !sport.Services.Any(s => s.ServiceType == SportServiceType.CourtRental && s.IsEnabled))
                    throw new InvalidOperationException($"Enable the '{code}' sport and court-rental service before seeding BR-141.");
                var group = sport.Services.SingleOrDefault(s => s.ServiceType == SportServiceType.GroupCourse && s.IsEnabled)
                    ?? throw new InvalidOperationException($"Enable group courses for '{code}' before seeding BR-141.");
                if (group.DefaultSessionMinutes != 120)
                {
                    // Upgrade only the untouched legacy badminton baseline, before any classes use it.
                    if (code == "badminton" && group.DefaultSessionMinutes == 90
                        && !await db.Classes.AnyAsync(c => c.SportId == sport.SportId, ct))
                        group.DefaultSessionMinutes = 120;
                    else
                        throw new InvalidOperationException($"BR-141 needs 120-minute '{code}' sessions. Review the sport configuration in management; existing classes were not changed.");
                }
            }
            foreach (var plan in pending)
            {
                var sport = sports[plan.Sport];
                var room = await db.Rooms.SingleOrDefaultAsync(r => r.Name == plan.Room, ct);
                if (room is null)
                {
                    var roomTypeId = await db.Set<SportRoomType>().Where(x => x.SportId == sport.SportId)
                        .OrderBy(x => x.RoomTypeId).Select(x => (int?)x.RoomTypeId).FirstOrDefaultAsync(ct)
                        ?? throw new InvalidOperationException($"Configure a room type for '{plan.Sport}' before seeding.");
                    room = new Room { Name = plan.Room, RoomTypeId = roomTypeId, Capacity = plan.RoomCapacity };
                    db.Rooms.Add(room);
                    await db.SaveChangesAsync(ct);
                    db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
                    {
                        RoomId = room.RoomId, DayOfWeek = day,
                        OpenTimeLocal = new TimeOnly(6, 0), CloseTimeLocal = new TimeOnly(22, 0)
                    }));
                }
                if (!room.IsActive || !await db.Set<SportRoomType>().AnyAsync(x => x.SportId == sport.SportId
                        && x.RoomTypeId == room.RoomTypeId, ct))
                    throw new InvalidOperationException($"Room '{plan.Room}' is inactive or incompatible. Review it in facility management; the seed does not change existing rooms.");
                rooms[plan.Code] = room;
                coaches[plan.Code] = await EnsureCoachAsync(plan.CoachEmail, sport.SportId, ct);
                // An existing rate, including an intentionally disabled one, belongs to the manager.
                if (!await db.Set<CourtRate>().AnyAsync(r => r.RoomTypeId == room.RoomTypeId
                        && (r.SportId == null || r.SportId == sport.SportId), ct))
                {
                    db.Set<CourtRate>().Add(new CourtRate
                    {
                        RoomTypeId = room.RoomTypeId!.Value, SportId = sport.SportId,
                        DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN", StartTimeLocal = new TimeOnly(6, 0),
                        EndTimeLocal = new TimeOnly(22, 0), PricePerHour = plan.Sport == "badminton" ? 100_000 : 200_000
                    });
                }
                await db.SaveChangesAsync(ct);
            }
            // Reject known conflicts before creating any class or committing new dependencies.
            foreach (var plan in pending)
            {
                var group = sports[plan.Sport].Services.Single(s => s.ServiceType == SportServiceType.GroupCourse);
                var room = rooms[plan.Code];
                var capacity = Math.Min(group.DefaultMaxCapacity ?? plan.RoomCapacity, room.Capacity);
                if (capacity < CourseRules.BreakEvenThreshold(plan.Cost, plan.Price))
                    throw new InvalidOperationException($"{plan.Code}: room/course capacity is below the break-even threshold. Review capacity in management.");
                var sessions = CourseRules.GenerateSessions(plan.Days == MonWedFri ? monday : monday.AddDays(1), 12,
                    plan.Days.Select(day => (day, TimeOnly.ParseExact(plan.Time, "HH:mm", System.Globalization.CultureInfo.InvariantCulture))).ToArray(), 120);
                foreach (var session in sessions)
                {
                    if (!await openingHours.IsOpenAsync(room.RoomId, session.StartAtUtc, session.EndAtUtc, ct)
                        || await db.RoomOccupancies.AnyAsync(o => o.RoomId == room.RoomId && o.IsActive
                            && o.StartAtUtc < session.EndAtUtc && session.StartAtUtc < o.EndAtUtc, ct)
                        || await db.CoachOccupancies.AnyAsync(o => o.CoachId == coaches[plan.Code] && o.IsActive
                            && o.StartAtUtc < session.EndAtUtc && session.StartAtUtc < o.EndAtUtc, ct))
                        throw new InvalidOperationException($"{plan.Code}: the BR-141 schedule conflicts with opening hours or an existing room/coach booking. Existing bookings were preserved; resolve the conflict before rerunning.");
                }
            }
            await tx.CommitAsync(ct);
        }

        foreach (var plan in pending)
        {
            var group = sports[plan.Sport].Services.Single(s => s.ServiceType == SportServiceType.GroupCourse);
            var room = rooms[plan.Code];
            var created = await classes.CreateAsync(new SaveClassRequest
            {
                Code = plan.Code, Name = plan.Name, SportId = sports[plan.Sport].SportId,
                CoachId = coaches[plan.Code], DefaultRoomId = room.RoomId,
                StartDate = plan.Days == MonWedFri ? monday : monday.AddDays(1), NumSessions = 12,
                Capacity = Math.Min(group.DefaultMaxCapacity ?? plan.RoomCapacity, room.Capacity),
                Price = plan.Price, CostAmount = plan.Cost,
                ScheduleRules = plan.Days.Select(day => new ScheduleRuleInput { DayOfWeek = day, StartTimeLocal = plan.Time }).ToList()
            }, managerId, ct);
            await classes.PublishAsync(created.ClassId, new PublishClassRequest { ExpectedVersion = created.Version }, managerId, ct);
            await classes.SetEnrollmentOpenAsync(created.ClassId, true, managerId, ct);
            logger.LogInformation("BR-141 published {Code}: {Sessions} sessions, 120 minutes each.", plan.Code, 12);
        }
        logger.LogInformation("BR-141 complete: created {Created}, preserved {Existing} existing class codes.", pending.Length, existing.Count);
    }

    private async Task<Guid> EnsureCoachAsync(string email, int sportId, CancellationToken ct)
    {
        var user = await db.UserAccounts.Include(u => u.Role).Include(u => u.CoachProfile)
            .SingleOrDefaultAsync(u => u.Email == email, ct);
        if (user is not null)
        {
            if (user.Status != UserStatus.Active || user.Role?.RoleName != UserRole.Coach || user.CoachProfile is null
                || !await db.UserSportSpecialties.AnyAsync(s => s.UserId == user.UserId && s.SportId == sportId, ct))
                throw new InvalidOperationException($"Coach '{email}' must be active, have a coach profile and the correct sport specialty. Resolve through account/coach management before seeding.");
            return user.UserId;
        }
        var password = configuration["Seed:Password"];
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12 || !password.Any(char.IsUpper)
            || !password.Any(char.IsLower) || !password.Any(char.IsDigit) || !password.Any(c => !char.IsLetterOrDigit(c)))
            throw new InvalidOperationException("Set Seed__Password (12+ characters, upper/lower case, digit and symbol) to create missing BR-141 coaches. Existing credentials are never changed.");
        var roleId = await db.Roles.Where(r => r.RoleName == UserRole.Coach).Select(r => r.RoleId).SingleAsync(ct);
        user = new UserAccount
        {
            UserId = Guid.NewGuid(), Email = email, RoleId = roleId, Status = UserStatus.Active, CreatedAt = clock.UtcNow,
            Credential = new UserCredential { PasswordHash = passwords.Hash(password) },
            Profile = new UserProfile { FullName = email switch {
                "coach.bongro@sporthub.vn" => "Trương Gia Huy", "coach.bongro2@sporthub.vn" => "Đinh Hải Nam",
                "coach.caulong@sporthub.vn" => "Đặng Quốc Bảo", _ => "Bùi Khánh Linh" } }, CoachProfile = new CoachProfile()
        };
        db.UserAccounts.Add(user);
        db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = user.UserId, SportId = sportId });
        await db.SaveChangesAsync(ct);
        return user.UserId;
    }
}
