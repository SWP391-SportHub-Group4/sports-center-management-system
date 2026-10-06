using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.API.Persistence;

/// <summary>
/// Seed demo: bốn lớp cố định BR-141 và bảng giá thuê sân. Chạy bằng lệnh riêng
/// (<c>dotnet run --project backend/SportHub.API -- --seed-br141=true</c>), không chạy khi khởi động.
///
/// - Lớp tạo qua <see cref="IClassService"/> (Create rồi Publish) nên dùng đúng ràng buộc thật: môn có dịch vụ lớp, phòng
///   tương thích, Coach đủ chuyên môn, giờ mở cửa, ClassSession và occupancy phòng + Coach được sinh như publish thật.
/// - Idempotent: chạy lại không nhân bản lớp, không ghi đè bảng giá hay cấu hình Manager đã sửa, không xóa booking.
/// - Giá thuê sân đi qua CourtRate (Manager sửa được), không hardcode trong logic tính tiền.
/// </summary>
public sealed class Br141DemoSeeder(
    SportHubDbContext db,
    IClassService classes,
    IPasswordHasher passwordHasher,
    IClock clock,
    ILogger<Br141DemoSeeder> logger)
{
    // Lựa chọn demo: mỗi lớp 12 buổi (4 tuần x 3 buổi), mã lớp tiền tố BR141 để không đụng lớp demo khác.
    private const int SessionsPerClass = 12;
    private const string DemoPassword = DemoDataSeeder.DemoPassword;

    private sealed record ClassPlan(string Code, string Name, string SportCode, int RoomIndex, int[] Days, string Start,
        decimal Price, decimal Cost, string CoachEmail);

    private static readonly int[] MonWedFri = [(int)DayOfWeek.Monday, (int)DayOfWeek.Wednesday, (int)DayOfWeek.Friday];
    private static readonly int[] TueThuSat = [(int)DayOfWeek.Tuesday, (int)DayOfWeek.Thursday, (int)DayOfWeek.Saturday];

    private static readonly ClassPlan[] Plans =
    [
        // Lớp 120 phút: 07:00-09:00 sáng (T2/4/6) và 14:00-16:00 chiều (T3/5/7), giờ Việt Nam.
        new("BR141-BONGRO-01", "Bóng rổ 01", "basketball", 1, MonWedFri, "07:00", 1_200_000m, 9_600_000m, "coach.bongro@sporthub.vn"),
        new("BR141-BONGRO-02", "Bóng rổ 02", "basketball", 2, TueThuSat, "14:00", 1_200_000m, 9_600_000m, "coach.bongro@sporthub.vn"),
        new("BR141-CAULONG-01", "Cầu lông 01", "badminton", 1, MonWedFri, "07:00", 900_000m, 4_500_000m, "coach.caulong@sporthub.vn"),
        new("BR141-CAULONG-02", "Cầu lông 02", "badminton", 2, TueThuSat, "14:00", 900_000m, 4_500_000m, "coach.caulong@sporthub.vn"),
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var manager = await db.UserAccounts.Where(u => u.Role!.RoleName == UserRole.CenterManager && u.Status == UserStatus.Active)
            .OrderBy(u => u.CreatedAt).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("Chưa có tài khoản Center Manager đang hoạt động để làm người tạo lớp.");

        var sports = await db.Set<Sport>().Include(s => s.Services).ToDictionaryAsync(s => s.Code, ct);
        foreach (var code in new[] { "badminton", "basketball" })
        {
            if (!sports.TryGetValue(code, out var sport) || !sport.IsActive)
                throw new InvalidOperationException($"Thiếu môn '{code}' đang hoạt động (chạy migration trước).");
            if (!sport.Services.Any(s => s.ServiceType == SportServiceType.GroupCourse && s.IsEnabled)
                || !sport.Services.Any(s => s.ServiceType == SportServiceType.CourtRental && s.IsEnabled))
                throw new InvalidOperationException($"Môn '{code}' cần bật khóa học nhóm và thuê sân.");
        }

        await AlignBadmintonSessionLengthAsync(sports["badminton"], ct);
        var rooms = await EnsureRoomsAsync(ct);
        await EnsureCourtRatesAsync(sports, ct);
        var coaches = await EnsureCoachesAsync(sports, ct);

        var monday = NextMonday(VietnamTime.TodayLocal(clock));
        foreach (var plan in Plans)
        {
            if (await db.Set<Class>().AnyAsync(c => c.Code == plan.Code, ct))
            {
                logger.LogInformation("Bỏ qua {Code}: đã có.", plan.Code);
                continue;
            }

            var sport = sports[plan.SportCode];
            var group = sport.Services.Single(s => s.ServiceType == SportServiceType.GroupCourse);
            var created = await classes.CreateAsync(new SaveClassRequest
            {
                Code = plan.Code,
                Name = plan.Name,
                SportId = sport.SportId,
                CoachId = coaches[plan.CoachEmail],
                DefaultRoomId = rooms[(plan.SportCode, plan.RoomIndex)].RoomId,
                StartDate = FirstScheduledDay(monday, plan.Days),
                NumSessions = SessionsPerClass,
                Capacity = group.DefaultMaxCapacity ?? 12,
                Price = plan.Price,
                CostAmount = plan.Cost,
                ScheduleRules = plan.Days.Select(d => new ScheduleRuleInput { DayOfWeek = d, StartTimeLocal = plan.Start }).ToList()
            }, manager.UserId, ct);

            await classes.PublishAsync(created.ClassId, new PublishClassRequest { ExpectedVersion = created.Version }, manager.UserId, ct);
            logger.LogInformation("Đã tạo và publish {Code} ({Name}).", plan.Code, plan.Name);
        }
    }

    /// <summary>
    /// BR-141 cần buổi 120 phút nhưng thời lượng lớp lấy từ mặc định của môn và seed cũ đặt Cầu lông 90 phút.
    /// Chỉ nâng 90 lên 120 khi môn chưa có lớp nào, để không đổi thời lượng của lịch đã tồn tại.
    /// </summary>
    private async Task AlignBadmintonSessionLengthAsync(Sport badminton, CancellationToken ct)
    {
        var group = badminton.Services.Single(s => s.ServiceType == SportServiceType.GroupCourse);
        if (group.DefaultSessionMinutes == 120) return;
        if (group.DefaultSessionMinutes == 90 && !await db.Set<Class>().AnyAsync(c => c.SportId == badminton.SportId, ct))
        {
            group.DefaultSessionMinutes = 120;
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Đặt thời lượng lớp mặc định của Cầu lông là 120 phút (chưa có lớp nào).");
            return;
        }

        throw new InvalidOperationException(
            $"Cầu lông đang có thời lượng lớp mặc định {group.DefaultSessionMinutes} phút và đã có lớp; BR-141 cần 120 phút. " +
            "Hãy chỉnh bằng tay trong Manager rồi chạy lại.");
    }

    private async Task<Dictionary<(string, int), Room>> EnsureRoomsAsync(CancellationToken ct)
    {
        // Loại phòng seed: 3 Sân cầu lông, 4 Sân bóng rổ. Mỗi môn hai sân riêng để lớp sáng và chiều không chung sân.
        var wanted = new[]
        {
            ("badminton", 1, "Sân cầu lông 01", 3, 12), ("badminton", 2, "Sân cầu lông 02", 3, 12),
            ("basketball", 1, "Sân bóng rổ 01", 4, 20), ("basketball", 2, "Sân bóng rổ 02", 4, 20),
        };
        var result = new Dictionary<(string, int), Room>();
        foreach (var (sport, index, name, roomType, capacity) in wanted)
        {
            var room = await db.Rooms.SingleOrDefaultAsync(r => r.Name == name, ct);
            if (room is null)
            {
                room = new Room { Name = name, Capacity = capacity, RoomTypeId = roomType };
                db.Rooms.Add(room);
                await db.SaveChangesAsync(ct);
            }

            if (!await db.RoomOpeningHours.AnyAsync(h => h.RoomId == room.RoomId, ct))
            {
                db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(d => new RoomOpeningHour
                {
                    RoomId = room.RoomId, DayOfWeek = d, OpenTimeLocal = new TimeOnly(6, 0), CloseTimeLocal = new TimeOnly(22, 0)
                }));
                await db.SaveChangesAsync(ct);
            }

            result[(sport, index)] = room;
        }

        return result;
    }

    /// <summary>Giá thuê 100.000 (Cầu lông) và 200.000 (Bóng rổ) mỗi giờ. Không ghi đè nếu đã có khung giá đang hoạt động.</summary>
    private async Task EnsureCourtRatesAsync(Dictionary<string, Sport> sports, CancellationToken ct)
    {
        foreach (var (code, roomTypeId, price) in new[] { ("badminton", 3, 100_000m), ("basketball", 4, 200_000m) })
        {
            var sportId = sports[code].SportId;
            if (await db.Set<CourtRate>().AnyAsync(r => r.IsActive && r.RoomTypeId == roomTypeId
                                                         && (r.SportId == null || r.SportId == sportId), ct))
                continue;

            db.Set<CourtRate>().Add(new CourtRate
            {
                RoomTypeId = roomTypeId, SportId = sportId, DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN",
                StartTimeLocal = new TimeOnly(6, 0), EndTimeLocal = new TimeOnly(22, 0), PricePerHour = price, IsActive = true
            });
            await db.SaveChangesAsync(ct);
        }
    }

    /// <summary>Coach nội bộ có chuyên môn đúng môn. Dùng tài khoản demo nếu đã có, ngược lại tạo mới (mật khẩu demo).</summary>
    private async Task<Dictionary<string, Guid>> EnsureCoachesAsync(Dictionary<string, Sport> sports, CancellationToken ct)
    {
        var role = await db.Roles.SingleAsync(r => r.RoleName == UserRole.Coach, ct);
        var wanted = new[]
        {
            ("coach.caulong@sporthub.vn", "Phạm Minh Cầu Lông", "0902000001", "badminton"),
            ("coach.bongro@sporthub.vn", "Vũ Hải Bóng Rổ", "0902000002", "basketball"),
        };
        var result = new Dictionary<string, Guid>();
        foreach (var (email, name, phone, sportCode) in wanted)
        {
            var user = await db.UserAccounts.SingleOrDefaultAsync(u => u.Email == email, ct);
            if (user is null)
            {
                user = new UserAccount
                {
                    UserId = Guid.NewGuid(), Email = email, RoleId = role.RoleId, Status = UserStatus.Active,
                    CreatedAt = clock.UtcNow,
                    Credential = new UserCredential { PasswordHash = passwordHasher.Hash(DemoPassword) },
                    Profile = new UserProfile { FullName = name, Phone = await FreePhoneAsync(phone, ct) },
                    CoachProfile = new CoachProfile()
                };
                db.UserAccounts.Add(user);
                await db.SaveChangesAsync(ct);
            }

            var sportId = sports[sportCode].SportId;
            if (!await db.UserSportSpecialties.AnyAsync(s => s.UserId == user.UserId && s.SportId == sportId, ct))
            {
                db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = user.UserId, SportId = sportId });
                await db.SaveChangesAsync(ct);
            }

            result[email] = user.UserId;
        }

        return result;
    }

    private async Task<string> FreePhoneAsync(string phone, CancellationToken ct)
    {
        while (await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
            phone = "09" + Random.Shared.NextInt64(10_000_000, 99_999_999);
        return phone;
    }

    /// <summary>Ngày bắt đầu của lớp phải trùng một thứ trong lịch lớp: lấy ngày đầu tiên từ <paramref name="from"/> thỏa điều đó.</summary>
    private static DateOnly FirstScheduledDay(DateOnly from, int[] days)
    {
        var d = from;
        while (!days.Contains((int)d.DayOfWeek)) d = d.AddDays(1);
        return d;
    }

    /// <summary>Thứ Hai kế tiếp sau hôm nay, để buổi đầu nằm trong tương lai.</summary>
    private static DateOnly NextMonday(DateOnly today)
    {
        var d = today.AddDays(1);
        while (d.DayOfWeek != DayOfWeek.Monday) d = d.AddDays(1);
        return d;
    }
}
