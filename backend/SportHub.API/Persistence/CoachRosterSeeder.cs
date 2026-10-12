using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.API.Persistence;

/// <summary>
/// Đội huấn luyện viên demo: 5 PT (Gym), 2 cầu lông, 2 bóng rổ, tên người Việt kèm ảnh minh họa trong
/// <c>frontend/public/sporthub/coaches</c>. Chạy bằng lệnh riêng
/// (<c>dotnet run --project backend/SportHub.API -- --seed-coaches=true</c>) hoặc khi seed DB rỗng.
///
/// Idempotent và không xóa dữ liệu: tài khoản theo email được tạo hoặc cập nhật tên, SĐT, tiểu sử, ảnh, chuyên môn;
/// Coach cũ không nằm trong danh sách bị khóa (Deactivated) thay vì xóa để lớp/buổi cũ còn nguyên tham chiếu.
/// Các lớp BR141 được gán lại cho Coach đúng môn (cả buổi học và chiếm chỗ của Coach).
/// </summary>
public sealed class CoachRosterSeeder(
    SportHubDbContext db,
    IPasswordHasher passwordHasher,
    IClock clock,
    ILogger<CoachRosterSeeder> logger)
{
    private const int GymSportId = 1;
    private const int BadmintonSportId = 3;
    private const int BasketballSportId = 4;

    private sealed record Coach(string Email, string FullName, string Phone, int SportId, bool Pt, string Slug, string Bio,
        string Title, int Years, int Students, string Philosophy);

    private static readonly Coach[] Roster =
    [
        new("coach.pt@sporthub.vn", "Nguyễn Minh Quân", "0902100001", GymSportId, true, "nguyen-minh-quan",
            "8 năm huấn luyện tăng cơ và sức mạnh. Xây giáo án rõ ràng, theo sát kỹ thuật từng buổi.",
            "Senior Personal Trainer", 8, 180, "Tiến bộ đo được từng tuần: đặt mục tiêu rõ, ghi lại số liệu, điều chỉnh giáo án theo cơ thể bạn."),
        new("coach.pt2@sporthub.vn", "Trần Thu Hà", "0902100002", GymSportId, true, "tran-thu-ha",
            "6 năm đồng hành cùng hội viên giảm mỡ và cải thiện vóc dáng bằng bài tập và dinh dưỡng thực tế.",
            "Body Transformation Coach", 6, 150, "Giảm mỡ bền vững đến từ thói quen nhỏ lặp lại mỗi ngày, không phải ép cân ngắn hạn."),
        new("coach.pt3@sporthub.vn", "Lê Hoàng Phúc", "0902100003", GymSportId, true, "le-hoang-phuc",
            "10 năm kinh nghiệm, mạnh về phục hồi chấn thương và đưa người mới tập vào nền nếp an toàn.",
            "Strength & Recovery Coach", 10, 220, "Tập an toàn trước, nặng sau. Kỹ thuật đúng là nền tảng cho mọi tiến bộ lâu dài."),
        new("coach.pt4@sporthub.vn", "Phạm Ngọc Anh", "0902100004", GymSportId, true, "pham-ngoc-anh",
            "5 năm huấn luyện thể lực tổng quát, dẻo dai và sức bền cho người đi làm bận rộn.",
            "Functional Fitness Trainer", 5, 120, "Giáo án gọn, hiệu quả và vừa với lịch làm việc thực tế của bạn."),
        new("coach.pt5@sporthub.vn", "Võ Đức Thịnh", "0902100005", GymSportId, true, "vo-duc-thinh",
            "7 năm luyện sức mạnh cho vận động viên nghiệp dư, chú trọng tiến bộ đo được qua từng tuần.",
            "Strength Performance Coach", 7, 140, "Sức mạnh là kỹ năng: luyện đều, tăng tải có kế hoạch và tôn trọng phục hồi."),
        new("coach.caulong@sporthub.vn", "Đặng Quốc Bảo", "0902100006", BadmintonSportId, false, "dang-quoc-bao",
            "9 năm dạy cầu lông từ cơ bản đến thi đấu phong trào, mạnh về di chuyển và các cú đập cầu.",
            "Badminton Head Coach", 9, 200, "Di chuyển tốt trước, đập cầu mạnh sau. Mỗi buổi tập một kỹ thuật trọng tâm."),
        new("coach.caulong2@sporthub.vn", "Bùi Khánh Linh", "0902100007", BadmintonSportId, false, "bui-khanh-linh",
            "6 năm dạy cầu lông cho học viên mới và thiếu niên, kiên nhẫn sửa kỹ thuật từng chi tiết nhỏ.",
            "Badminton Coach", 6, 130, "Sửa từng chi tiết nhỏ với sự kiên nhẫn để học viên tự tin ra sân."),
        new("coach.bongro@sporthub.vn", "Trương Gia Huy", "0902100008", BasketballSportId, false, "truong-gia-huy",
            "8 năm huấn luyện bóng rổ, từng thi đấu giải sinh viên, giỏi dạy dẫn bóng và ném rổ.",
            "Basketball Head Coach", 8, 160, "Nắm vững cơ bản dẫn bóng và ném rổ rồi mới nghĩ đến chiến thuật."),
        new("coach.bongro2@sporthub.vn", "Đinh Hải Nam", "0902100009", BasketballSportId, false, "dinh-hai-nam",
            "7 năm dạy bóng rổ đồng đội, chiến thuật phòng ngự và phối hợp cho các nhóm tập cuối tuần.",
            "Team Basketball Coach", 7, 110, "Bóng rổ là môn đồng đội: phòng ngự và phối hợp quyết định trận đấu."),
    ];

    /// <summary>Lớp demo BR141 → email Coach phụ trách (mỗi môn hai lớp, mỗi lớp một Coach).</summary>
    private static readonly Dictionary<string, string> ClassCoach = new()
    {
        ["BR141-CAULONG-01"] = "coach.caulong@sporthub.vn",
        ["BR141-CAULONG-02"] = "coach.caulong2@sporthub.vn",
        ["BR141-BONGRO-01"] = "coach.bongro@sporthub.vn",
        ["BR141-BONGRO-02"] = "coach.bongro2@sporthub.vn",
    };

    public static string CoachEmailForClass(string classCode) => ClassCoach[classCode];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var role = await db.Roles.SingleAsync(r => r.RoleName == UserRole.Coach, ct);
        var ptOffering = await db.Set<SportServiceOffering>()
            .Where(o => o.ServiceType == SportServiceType.PersonalTraining)
            .Select(o => (int?)o.OfferingId).FirstOrDefaultAsync(ct);

        var byEmail = new Dictionary<string, UserAccount>();
        foreach (var c in Roster)
        {
            var user = await db.UserAccounts.Include(u => u.Profile).Include(u => u.CoachProfile)
                .SingleOrDefaultAsync(u => u.Email == c.Email, ct);
            if (user is null)
            {
                user = new UserAccount
                {
                    UserId = Guid.NewGuid(), Email = c.Email, RoleId = role.RoleId, Status = UserStatus.Active,
                    CreatedAt = clock.UtcNow,
                    Credential = new UserCredential { PasswordHash = passwordHasher.Hash(DemoDataSeeder.DemoPassword) },
                    Profile = new UserProfile(),
                    CoachProfile = new CoachProfile()
                };
                db.UserAccounts.Add(user);
            }

            user.RoleId = role.RoleId;
            user.Status = UserStatus.Active;
            user.Profile ??= new UserProfile { UserId = user.UserId };
            user.CoachProfile ??= new CoachProfile { UserId = user.UserId };
            user.Profile.FullName = c.FullName;
            if (!await db.Set<UserProfile>().AnyAsync(p => p.Phone == c.Phone && p.UserId != user.UserId, ct))
                user.Profile.Phone = c.Phone;
            user.Profile.AvatarUrl = $"/sporthub/coaches/{c.Slug}.svg";
            user.Profile.AvatarPublicId = null;
            user.Profile.AvatarVersion += 1;
            user.CoachProfile.Bio = c.Bio;
            user.CoachProfile.Title = c.Title;
            user.CoachProfile.YearsExperience = c.Years;
            user.CoachProfile.StudentCount = c.Students;
            user.CoachProfile.Philosophy = c.Philosophy;
            byEmail[c.Email] = user;
        }

        await db.SaveChangesAsync(ct);
        var userIds = byEmail.ToDictionary(x => x.Key, x => x.Value.UserId);
        // Dọn các thực thể đang theo dõi (khi chạy sau DemoDataSeeder) để xóa/ghi lại chuyên môn không đụng khóa trùng.
        db.ChangeTracker.Clear();

        // Chuyên môn và quyền dạy PT đặt lại theo đúng môn.
        var ids = userIds.Values.ToList();
        await db.UserSportSpecialties.Where(s => ids.Contains(s.UserId)).ExecuteDeleteAsync(ct);
        await db.Set<CoachServiceQualification>().Where(q => ids.Contains(q.UserId)).ExecuteDeleteAsync(ct);
        foreach (var c in Roster)
        {
            var userId = userIds[c.Email];
            db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = userId, SportId = c.SportId });
            if (c.Pt && ptOffering is int offering)
                db.Set<CoachServiceQualification>().Add(new CoachServiceQualification { UserId = userId, OfferingId = offering });
        }

        // Coach cũ ngoài danh sách: khóa tài khoản, giữ lịch sử.
        var emails = Roster.Select(c => c.Email).ToList();
        var retired = await db.UserAccounts.Where(u => u.RoleId == role.RoleId && !emails.Contains(u.Email)
                && u.Status == UserStatus.Active).ToListAsync(ct);
        foreach (var user in retired) user.Status = UserStatus.Deactivated;
        await db.SaveChangesAsync(ct);

        foreach (var (classCode, email) in ClassCoach)
        {
            var coachId = userIds[email];
            var classId = await db.Set<Class>().Where(x => x.Code == classCode).Select(x => (int?)x.ClassId).SingleOrDefaultAsync(ct);
            if (classId is not int id) continue;
            await db.Set<Class>().Where(x => x.ClassId == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.CoachId, coachId), ct);
            await db.Set<ClassSession>().Where(x => x.ClassId == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.CoachId, coachId), ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE coach_occupancies SET coach_id = {coachId}
                WHERE source_id IN (SELECT session_id FROM class_sessions WHERE class_id = {id})
                """, ct);
        }

        logger.LogInformation("Đã seed {Count} huấn luyện viên (5 PT, 2 cầu lông, 2 bóng rổ); khóa {Retired} coach cũ.",
            Roster.Length, retired.Count);
    }
}
