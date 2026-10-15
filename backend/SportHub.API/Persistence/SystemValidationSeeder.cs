using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.API.Persistence;

/// <summary>Explicit, additive local setup. Transactions and attendance must be created through the real workflows.</summary>
public sealed class SystemValidationSeeder(SportHubDbContext db, IPasswordHasher passwords,
    IClassService classes, IClock clock, IConfiguration configuration, ILogger<SystemValidationSeeder> logger)
{
    public async Task SeedGymSixMonthsAsync(CancellationToken ct = default)
    {
        const string name = "Gym 6 months";
        const string description = "Unlimited Gym access for 180 days. Save 1,200,000 VND.";
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026101301)", ct);
        var package = await db.MembershipPackages.SingleOrDefaultAsync(p => p.Name == name, ct);
        if (package is null)
        {
            package = new MembershipPackage
            {
                Name = name, Price = 2_400_000, OriginalPrice = 3_600_000, DurationDays = 180,
                SessionLimit = null, IsActive = true, Description = description
            };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync(ct);
        }
        else if (package.Price == 2_400_000 && package.DurationDays == 180
            && package.SessionLimit is null && package.IsActive
            && package.OriginalPrice is null
            && package.Description == "Unlimited Gym access for 180 days. Regular price: 3,600,000 VND. Promotional price: 2,400,000 VND. Save 1,200,000 VND.")
        {
            package.OriginalPrice = 3_600_000;
            package.Description = description;
            await db.SaveChangesAsync(ct);
        }
        else if (package.Price != 2_400_000 || package.OriginalPrice != 3_600_000 || package.DurationDays != 180
            || package.SessionLimit is not null || !package.IsActive || package.Description != description)
            throw new InvalidOperationException("Gym 6 months already exists with different settings. Update it through package management.");
        await tx.CommitAsync(ct);
        logger.LogInformation("Gym package ready: ID {PackageId}, {Name}, {Days} days, {Price} VND. Regular price: 3600000 VND.",
            package.PackageId, package.Name, package.DurationDays, package.Price);
    }

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var accounts = new[] {
            ("admin@sporthub.vn", "System Administrator", UserRole.SystemAdministrator),
            ("manager@sporthub.vn", "Center Manager", UserRole.CenterManager),
            ("letan@sporthub.vn", "Receptionist", UserRole.Receptionist),
            ("coach.caulong@sporthub.vn", "Badminton Coach", UserRole.Coach),
            ("coach.bongro@sporthub.vn", "Basketball Coach", UserRole.Coach),
            ("an.member@sporthub.vn", "Member An", UserRole.Member),
            ("binh.member@sporthub.vn", "Member Binh", UserRole.Member)
        };
        var emails = accounts.Select(a => a.Item1).ToArray();
        var existing = await db.UserAccounts.Include(u => u.Role).Where(u => emails.Contains(u.Email)).ToDictionaryAsync(u => u.Email, ct);
        var password = configuration["Seed:Password"];
        if (accounts.Any(a => !existing.ContainsKey(a.Item1)) && string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Set Seed__Password locally before creating missing validation accounts. Existing passwords are never changed.");
        if (password is not null && (password.Length < 12 || !password.Any(char.IsUpper) || !password.Any(char.IsLower)
                || !password.Any(char.IsDigit) || !password.Any(c => !char.IsLetterOrDigit(c))))
            throw new InvalidOperationException("Seed__Password must contain at least 12 characters with upper/lower case, a digit and a symbol.");
        foreach (var (email, _, role) in accounts)
            if (existing.TryGetValue(email, out var user) && (user.Role!.RoleName != role || user.Status != UserStatus.Active))
                throw new InvalidOperationException($"Account '{email}' has a different role or is inactive. Resolve through account administration before seeding.");

        await using (var tx = await db.Database.BeginTransactionAsync(ct)) {
            // Serializes concurrent runs without touching existing user data.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026101301)", ct);
            var roles = await db.Roles.ToDictionaryAsync(r => r.RoleName, ct);
            foreach (var (email, name, role) in accounts) {
                var user = await db.UserAccounts.Include(u => u.Role).SingleOrDefaultAsync(u => u.Email == email, ct);
                if (user is null) {
                    user = new UserAccount { UserId = Guid.NewGuid(), Email = email, RoleId = roles[role].RoleId,
                        Status = UserStatus.Active, CreatedAt = clock.UtcNow,
                        Credential = new UserCredential { PasswordHash = passwords.Hash(password!) },
                        Profile = new UserProfile { FullName = name },
                        CoachProfile = role == UserRole.Coach ? new CoachProfile() : null };
                    db.UserAccounts.Add(user);
                    await db.SaveChangesAsync(ct);
                }
                existing[email] = user;
            }
            foreach (var (email, sportId) in new[] { ("coach.caulong@sporthub.vn", 3), ("coach.bongro@sporthub.vn", 4) }) {
                var userId = existing[email].UserId;
                if (!await db.UserSportSpecialties.AnyAsync(s => s.UserId == userId && s.SportId == sportId, ct))
                    db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = userId, SportId = sportId });
            }
            if (!await db.MembershipPackages.AnyAsync(p => p.IsActive && p.DurationDays == 30, ct))
                db.MembershipPackages.Add(new MembershipPackage { Name = "Gym 30 days", Price = 600_000,
                    DurationDays = 30, IsActive = true, Description = "Gym access for 30 days." });
            if (!await db.Rooms.AnyAsync(r => r.IsActive && r.RoomTypeId == 1, ct)) {
                var gym = new Room { Name = "Validation Gym", RoomTypeId = 1, Capacity = 30 };
                db.Rooms.Add(gym);
                await db.SaveChangesAsync(ct);
                db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour {
                    RoomId = gym.RoomId, DayOfWeek = day, OpenTimeLocal = new TimeOnly(6, 0), CloseTimeLocal = new TimeOnly(22, 0) }));
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        var managerId = existing["manager@sporthub.vn"].UserId;
        var today = VietnamTime.TodayLocal(clock);
        var monday = today.AddDays(14 + ((8 - (int)today.DayOfWeek) % 7));
        foreach (var (sportId, typeId, sport, email, price) in new[] {
            (3, 3, "Badminton", "coach.caulong@sporthub.vn", 100_000m),
            (4, 4, "Basketball", "coach.bongro@sporthub.vn", 200_000m)
        }) {
            var roomName = $"Validation {sport} Court";
            var room = await db.Rooms.SingleOrDefaultAsync(r => r.Name == roomName, ct);
            await using (var roomTx = await db.Database.BeginTransactionAsync(ct)) {
                if (room is null) {
                    room = new Room { Name = roomName, RoomTypeId = typeId, Capacity = sportId == 3 ? 12 : 20 };
                    db.Rooms.Add(room);
                    await db.SaveChangesAsync(ct);
                    db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour {
                        RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new TimeOnly(6, 0), CloseTimeLocal = new TimeOnly(22, 0) }));
                }
                await db.SaveChangesAsync(ct);
                await roomTx.CommitAsync(ct);
            }
            if (!await db.Set<CourtRate>().AnyAsync(r => r.IsActive && r.RoomTypeId == typeId && (r.SportId == null || r.SportId == sportId), ct))
                db.Set<CourtRate>().Add(new CourtRate { RoomTypeId = typeId, SportId = sportId,
                    DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN", StartTimeLocal = new TimeOnly(6, 0),
                    EndTimeLocal = new TimeOnly(22, 0), PricePerHour = price, IsActive = true });
            await db.SaveChangesAsync(ct);
            var code = $"VALIDATION-{sport.ToUpperInvariant()}";
            var previous = await db.Classes.AsNoTracking().SingleOrDefaultAsync(c => c.Code == code, ct);
            if (previous is not null && (previous.Status != ClassStatus.Draft || previous.Version != 1
                || previous.Name != $"{sport} fundamentals" || previous.CoachId != existing[email].UserId
                || previous.DefaultRoomId != room.RoomId || previous.NumSessions != 4)) continue;
            var duration = await db.Set<SportServiceOffering>().Where(o => o.SportId == sportId && o.ServiceType == SportServiceType.GroupCourse)
                .Select(o => o.DefaultSessionMinutes).SingleAsync(ct)
                ?? throw new InvalidOperationException("Configure the group-course session duration first.");
            var (startDate, startTime) = await AvailableScheduleAsync(existing[email].UserId, room.RoomId, monday, duration, ct);
            var request = new SaveClassRequest {
                Code = code, Name = $"{sport} fundamentals", SportId = sportId, CoachId = existing[email].UserId,
                DefaultRoomId = room.RoomId, StartDate = startDate, NumSessions = 4, Capacity = Math.Min(room.Capacity, 12),
                Price = 400_000, CostAmount = 400_000,
                ScheduleRules = [new ScheduleRuleInput { DayOfWeek = 1, StartTimeLocal = startTime },
                    new ScheduleRuleInput { DayOfWeek = 3, StartTimeLocal = startTime }]
            };
            // Only resume the unedited draft owned by this seed after an interrupted publication.
            var course = previous is null ? await classes.CreateAsync(request, managerId, ct)
                : await classes.UpdateAsync(previous.ClassId, request, managerId, ct);
            await classes.PublishAsync(course.ClassId, new PublishClassRequest { ExpectedVersion = course.Version }, managerId, ct);
        }
        logger.LogInformation("Validation setup complete. Existing records preserved; no paid invoices, enrollments, attendance or wallet credits fabricated.");
    }

    private async Task<(DateOnly Date, string Time)> AvailableScheduleAsync(Guid coachId, int roomId, DateOnly monday, int duration, CancellationToken ct)
    {
        for (var week = 0; week < 8; week++) {
            var first = monday.AddDays(week * 7);
            for (var hour = 6; hour + duration / 60d <= 22; hour += 2) {
                var free = true;
                foreach (var offset in new[] { 0, 2, 7, 9 }) {
                    var start = VietnamTime.StartOfDayUtc(first.AddDays(offset)).AddHours(hour);
                    var end = start.AddMinutes(duration);
                    if (await db.Set<CoachOccupancy>().AnyAsync(o => o.IsActive && o.CoachId == coachId && o.StartAtUtc < end && start < o.EndAtUtc, ct)
                        || await db.Set<RoomOccupancy>().AnyAsync(o => o.IsActive && o.RoomId == roomId && o.StartAtUtc < end && start < o.EndAtUtc, ct)) {
                        free = false; break;
                    }
                }
                if (free) return (first, $"{hour:00}:00");
            }
        }
        throw new InvalidOperationException("No free four-session schedule was found in the next eight weeks. Existing bookings were preserved.");
    }
}
