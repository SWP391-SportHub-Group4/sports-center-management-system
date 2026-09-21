using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Infrastructure;
using SportHub.Scheduling.Domain.Constants;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.API.Persistence;

/// <summary>
/// Dữ liệu demo cho môi trường phát triển.
///
/// Tài khoản demo dùng ĐĂNG NHẬP THẬT: mật khẩu được băm bằng đúng IPasswordHasher của ứng
/// dụng (BCrypt cost 11, BR-5), không có cửa sau nào bỏ qua xác thực. Màn hình đăng nhập của
/// frontend có nút điền nhanh, nhưng nút đó chỉ điền form rồi gọi POST /api/auth/login như
/// người dùng thật.
///
/// Chỉ chạy khi môi trường là Development VÀ database chưa có tài khoản nào — không bao giờ
/// đụng vào dữ liệu đã có.
/// </summary>
public sealed class DemoDataSeeder(
    SportHubDbContext db,
    IPasswordHasher passwordHasher,
    IInvoiceNumberGenerator invoiceNumbers,
    IClock clock,
    ILogger<DemoDataSeeder> logger)
{
    /// <summary>Mật khẩu dùng chung cho mọi tài khoản demo. Chỉ có ý nghĩa ở môi trường dev.</summary>
    public const string DemoPassword = "Sporthub@123";

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (await db.UserAccounts.AnyAsync(ct))
        {
            logger.LogInformation("Bỏ qua seed dữ liệu demo: database đã có tài khoản.");

            return;
        }

        logger.LogInformation("Seed dữ liệu demo cho môi trường Development…");

        var now = clock.UtcNow;
        var today = VietnamTime.TodayLocal(clock);

        var roles = await db.Roles.ToDictionaryAsync(r => r.RoleName, ct);

        var admin = NewUser("admin@sporthub.vn", "Nguyễn Quản Trị", "0901000001", UserRole.SystemAdministrator);
        var manager = NewUser("manager@sporthub.vn", "Trần Thu Quản Lý", "0901000002", UserRole.CenterManager);
        var reception = NewUser("letan@sporthub.vn", "Lê Thị Lễ Tân", "0901000003", UserRole.Receptionist);

        var coachYoga = NewUser("coach.yoga@sporthub.vn", "Phạm Minh Yoga", "0902000001", UserRole.Coach);
        var coachGroupX = NewUser("coach.groupx@sporthub.vn", "Vũ Hải Group X", "0902000002", UserRole.Coach);
        var coachPt = NewUser("coach.pt@sporthub.vn", "Đỗ Quang PT", "0902000003", UserRole.Coach);

        var members = new[]
        {
            NewUser("an.member@sporthub.vn", "Hồ Lê Thiên An", "0903000001", UserRole.Member),
            NewUser("binh.member@sporthub.vn", "Nguyễn Thanh Bình", "0903000002", UserRole.Member),
            NewUser("chi.member@sporthub.vn", "Lý Bảo Chi", "0903000003", UserRole.Member),
            NewUser("dung.member@sporthub.vn", "Trịnh Tiến Dũng", "0903000004", UserRole.Member),
            NewUser("giang.member@sporthub.vn", "Mai Hương Giang", "0903000005", UserRole.Member),
            NewUser("hoa.member@sporthub.vn", "Bùi Thanh Hoa", "0903000006", UserRole.Member)
        };

        var allUsers = new List<UserAccount> { admin, manager, reception, coachYoga, coachGroupX, coachPt };
        allUsers.AddRange(members);

        foreach (var user in allUsers)
        {
            user.RoleId = roles[RoleOf(user)].RoleId;
        }

        db.UserAccounts.AddRange(allUsers);
        await db.SaveChangesAsync(ct);

        // Một tài khoản bị khóa để màn hình quản trị có dữ liệu thật minh hoạ BR-6.
        members[^1].Status = UserStatus.Deactivated;

        var rooms = new[]
        {
            new Room { Name = "Phòng Yoga A", Capacity = 20 },
            new Room { Name = "Sảnh Group X", Capacity = 30 },
            new Room { Name = "Phòng PT 1", Capacity = 2 },
            new Room { Name = "Khu Gym tự do", Capacity = 80 }
        };

        db.Rooms.AddRange(rooms);

        var packages = new[]
        {
            new MembershipPackage
            {
                Name = "Gym tháng",
                Price = 600_000m,
                DurationDays = 30,
                SessionLimit = null,
                Description = "Ra vào Gym/Fitness tự do trong 30 ngày, không giới hạn số lần check-in.",
                IsActive = true
            },
            new MembershipPackage
            {
                Name = "Yoga 12 buổi",
                Price = 1_800_000m,
                DurationDays = 90,
                SessionLimit = 12,
                Description = "12 buổi Yoga nhóm, dùng trong 90 ngày.",
                IsActive = true
            },
            new MembershipPackage
            {
                Name = "Group X 20 buổi",
                Price = 2_400_000m,
                DurationDays = 120,
                SessionLimit = 20,
                Description = "20 buổi Group X / Aerobic / HIIT, dùng trong 120 ngày.",
                IsActive = true
            },
            new MembershipPackage
            {
                Name = "Personal Training 10 buổi",
                Price = 6_000_000m,
                DurationDays = 90,
                SessionLimit = 10,
                Description = "10 buổi tập 1 kèm 1 với huấn luyện viên cá nhân.",
                IsActive = true
            },
            new MembershipPackage
            {
                Name = "Combo thử 3 buổi (ngừng bán)",
                Price = 300_000m,
                DurationDays = 14,
                SessionLimit = 3,
                Description = "Gói dùng thử cũ — giữ lại để minh hoạ gói đã ngừng áp dụng (BR-8).",
                IsActive = false
            }
        };

        db.MembershipPackages.AddRange(packages);
        await db.SaveChangesAsync(ct);

        var classes = new[]
        {
            new Class
            {
                Name = "Yoga buổi sáng",
                Discipline = Disciplines.Yoga,
                DefaultRoomId = rooms[0].RoomId,
                DefaultCoachId = coachYoga.UserId,
                Capacity = 15,
                Status = ClassStatus.Active
            },
            new Class
            {
                Name = "Group X đốt mỡ",
                Discipline = Disciplines.GroupX,
                DefaultRoomId = rooms[1].RoomId,
                DefaultCoachId = coachGroupX.UserId,
                Capacity = 25,
                Status = ClassStatus.Active
            },
            new Class
            {
                Name = "PT 1 kèm 1",
                Discipline = Disciplines.PersonalTraining,
                DefaultRoomId = rooms[2].RoomId,
                DefaultCoachId = coachPt.UserId,

                // Personal Training luôn có sức chứa 1 (SSOT §1.1, DB CHECK ở ClassConfiguration).
                Capacity = Disciplines.PersonalTrainingCapacity,
                Status = ClassStatus.Active
            }
        };

        db.Classes.AddRange(classes);
        await db.SaveChangesAsync(ct);

        db.ClassRecurrences.AddRange(
            new ClassRecurrence
            {
                ClassId = classes[0].ClassId,
                DaysOfWeek = "MON,WED,FRI",
                StartTimeLocal = new TimeOnly(6, 0),
                EndTimeLocal = new TimeOnly(7, 0),
                Timezone = "Asia/Ho_Chi_Minh",
                EffectiveFrom = today.AddDays(-30),
                EffectiveTo = null
            },
            new ClassRecurrence
            {
                ClassId = classes[1].ClassId,
                DaysOfWeek = "TUE,THU,SAT",
                StartTimeLocal = new TimeOnly(18, 0),
                EndTimeLocal = new TimeOnly(19, 0),
                Timezone = "Asia/Ho_Chi_Minh",
                EffectiveFrom = today.AddDays(-30),
                EffectiveTo = null
            },
            new ClassRecurrence
            {
                ClassId = classes[2].ClassId,
                DaysOfWeek = "MON,THU",
                StartTimeLocal = new TimeOnly(17, 0),
                EndTimeLocal = new TimeOnly(18, 0),
                Timezone = "Asia/Ho_Chi_Minh",
                EffectiveFrom = today.AddDays(-30),
                EffectiveTo = null
            });

        await db.SaveChangesAsync(ct);

        // Buổi học trải cả quá khứ lẫn tương lai: quá khứ để màn hình điểm danh và lịch sử
        // tập có dữ liệu, tương lai để màn hình đặt lịch có chỗ đăng ký.
        var sessions = BuildSessions(classes, rooms, today, now);
        db.ClassSessions.AddRange(sessions);
        await db.SaveChangesAsync(ct);

        await SeedPackagesAndInvoicesAsync(members, manager, reception, packages, today, now, ct);
        await SeedEnrollmentsAsync(members, sessions, now, ct);
        await SeedTrainingAsync(members, coachYoga, coachGroupX, coachPt, classes, now, ct);
        await SeedGymCheckInsAsync(members, reception, now, ct);

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Đã seed dữ liệu demo: {Users} tài khoản, {Sessions} buổi học. Mật khẩu chung: {Password}",
            allUsers.Count, sessions.Count, DemoPassword);
    }

    private List<ClassSession> BuildSessions(Class[] classes, Room[] rooms, DateOnly today, DateTime now)
    {
        var sessions = new List<ClassSession>();

        var plans = new (Class Class, Room Room, string[] Days, TimeOnly Start, TimeOnly End)[]
        {
            (classes[0], rooms[0], ["MON", "WED", "FRI"], new TimeOnly(6, 0), new TimeOnly(7, 0)),
            (classes[1], rooms[1], ["TUE", "THU", "SAT"], new TimeOnly(18, 0), new TimeOnly(19, 0)),
            (classes[2], rooms[2], ["MON", "THU"], new TimeOnly(17, 0), new TimeOnly(18, 0))
        };

        var dayCodes = new Dictionary<DayOfWeek, string>
        {
            [DayOfWeek.Monday] = "MON",
            [DayOfWeek.Tuesday] = "TUE",
            [DayOfWeek.Wednesday] = "WED",
            [DayOfWeek.Thursday] = "THU",
            [DayOfWeek.Friday] = "FRI",
            [DayOfWeek.Saturday] = "SAT",
            [DayOfWeek.Sunday] = "SUN"
        };

        foreach (var plan in plans)
        {
            for (var offset = -21; offset <= 21; offset++)
            {
                var day = today.AddDays(offset);

                if (!plan.Days.Contains(dayCodes[day.ToDateTime(TimeOnly.MinValue).DayOfWeek]))
                {
                    continue;
                }

                var startUtc = VietnamTime.ToUtc(day.ToDateTime(plan.Start));
                var endUtc = VietnamTime.ToUtc(day.ToDateTime(plan.End));

                // BR-51: trần chốt tại thời điểm tạo = MIN(sức chứa phòng, sức chứa lớp).
                var baseline = Math.Min(plan.Room.Capacity, plan.Class.Capacity);

                sessions.Add(new ClassSession
                {
                    SessionId = Guid.NewGuid(),
                    ClassId = plan.Class.ClassId,
                    RoomId = plan.Room.RoomId,
                    CoachId = plan.Class.DefaultCoachId!.Value,
                    StartAtUtc = startUtc,
                    EndAtUtc = endUtc,
                    BaselineCapacity = baseline,
                    Capacity = baseline,
                    ConfirmedCount = 0,
                    Status = endUtc <= now ? ClassSessionStatus.Completed : ClassSessionStatus.Scheduled
                });
            }
        }

        return sessions;
    }

    private async Task SeedPackagesAndInvoicesAsync(
        UserAccount[] members,
        UserAccount manager,
        UserAccount reception,
        MembershipPackage[] packages,
        DateOnly today,
        DateTime now,
        CancellationToken ct)
    {
        // Mỗi hội viên một tình huống khác nhau để mọi màn hình đều có ca thật để xem:
        // gói đang chạy đã thu đủ, gói mới thu một phần, và gói chưa thu đồng nào.
        var plans = new (UserAccount Member, MembershipPackage Package, decimal Paid)[]
        {
            (members[0], packages[1], packages[1].Price),      // Yoga, đã thanh toán đủ
            (members[0], packages[0], packages[0].Price),      // Gym tháng, đã thanh toán đủ
            (members[1], packages[2], packages[2].Price),      // Group X, đã thanh toán đủ
            (members[2], packages[3], packages[3].Price),      // PT, đã thanh toán đủ
            (members[3], packages[1], 600_000m),               // Yoga, mới đặt cọc (BR-55)
            (members[4], packages[0], 0m)                      // Gym tháng, chưa thu đồng nào
        };

        foreach (var plan in plans)
        {
            var isPaid = plan.Paid >= plan.Package.Price;

            var memberPackage = new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(),
                MemberId = plan.Member.UserId,
                PackageId = plan.Package.PackageId,
                StartDate = isPaid ? today.AddDays(-10) : today,
                EndDate = isPaid ? today.AddDays(-10).AddDays(plan.Package.DurationDays - 1) : today,
                RemainingSessions = plan.Package.SessionLimit,
                Status = isPaid ? MemberPackageStatus.Active : MemberPackageStatus.PendingPayment
            };

            db.MemberPackages.Add(memberPackage);

            var issuedAt = now.AddDays(-10);

            var invoice = new Invoice
            {
                InvoiceId = Guid.NewGuid(),
                InvoiceNumber = await invoiceNumbers.NextAsync(issuedAt, ct),
                MemberId = plan.Member.UserId,
                IssuedByUserId = reception.UserId,
                MemberPackageId = memberPackage.MemberPackageId,
                TotalAmount = plan.Package.Price,
                Status = isPaid
                    ? InvoiceStatus.Paid
                    : plan.Paid > 0 ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Issued,
                IssuedAt = issuedAt,

                // BR-55: hạn ban đầu 2 tháng; nhận cọc đầu thì dời thành 12 tháng từ ngày cọc.
                DueDateUtc = plan.Paid > 0 ? issuedAt.AddMonths(12) : issuedAt.AddMonths(2),
                FirstDepositAtUtc = plan.Paid > 0 ? issuedAt : null
            };

            db.Invoices.Add(invoice);

            db.InvoiceItems.Add(new InvoiceItem
            {
                ItemId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Description = $"Gói {plan.Package.Name} ({plan.Package.DurationDays} ngày)",
                Amount = plan.Package.Price,
                RelatedEntityType = InvoiceItemRelatedEntityType.Package,
                RelatedEntityId = memberPackage.MemberPackageId
            });

            if (plan.Paid > 0)
            {
                db.Payments.Add(new Payment.Domain.Entities.Payment
                {
                    PaymentId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    Amount = plan.Paid,
                    Method = PaymentMethod.Cash,
                    Status = PaymentStatus.Success,
                    ReceivedByUserId = reception.UserId,
                    PaidAt = issuedAt
                });
            }
        }

        await db.SaveChangesAsync(ct);

        // Một yêu cầu điều chỉnh đang chờ duyệt, để màn hình duyệt của Manager có việc thật:
        // do Lễ tân tạo nên Manager duyệt được (BR-42 chỉ cấm tự duyệt yêu cầu của chính mình).
        var firstInvoice = await db.Invoices.OrderBy(i => i.IssuedAt).FirstAsync(ct);

        db.PaymentAdjustments.Add(new PaymentAdjustment
        {
            AdjustmentId = Guid.NewGuid(),
            InvoiceId = firstInvoice.InvoiceId,
            Type = PaymentAdjustmentType.Discount,
            Amount = 200_000m,
            Reason = "Khuyến mãi giới thiệu bạn bè — chờ Quản lý Trung tâm phê duyệt.",
            Status = PaymentAdjustmentStatus.Requested,
            RequestedByUserId = reception.UserId,
            CreatedAt = now.AddDays(-1)
        });

        _ = manager;
    }

    private async Task SeedEnrollmentsAsync(
        UserAccount[] members,
        List<ClassSession> sessions,
        DateTime now,
        CancellationToken ct)
    {
        var activePackages = await db.MemberPackages
            .Where(mp => mp.Status == MemberPackageStatus.Active && mp.RemainingSessions != null)
            .ToListAsync(ct);

        if (activePackages.Count == 0)
        {
            return;
        }

        var random = new Random(20260921); // hạt cố định: mỗi lần seed lại cho cùng một dữ liệu

        foreach (var package in activePackages)
        {
            var candidates = sessions
                .Where(s => s.Status != ClassSessionStatus.Cancelled)
                .OrderBy(s => s.StartAtUtc)
                .Where(s => s.ConfirmedCount < s.Capacity)
                .Take(30)
                .OrderBy(_ => random.Next())
                .Take(4)
                .ToList();

            foreach (var session in candidates)
            {
                if (package.RemainingSessions is <= 0)
                {
                    break;
                }

                var isPast = session.EndAtUtc <= now;

                db.Enrollments.Add(new Enrollment
                {
                    EnrollmentId = Guid.NewGuid(),
                    SessionId = session.SessionId,
                    MemberId = package.MemberId,
                    MemberPackageId = package.MemberPackageId,
                    Status = EnrollmentStatus.Confirmed,
                    RegisteredAt = session.StartAtUtc.AddDays(-2),

                    // BR-50: snapshot khớp giá trị seed của system setting.
                    CancellationDeadlineHours = 12
                });

                session.ConfirmedCount += 1;
                package.RemainingSessions -= 1;

                _ = isPast;
            }
        }

        await db.SaveChangesAsync(ct);

        // Điểm danh cho các buổi đã kết thúc: phần lớn có mặt, một ít vắng — đủ để màn hình
        // lịch sử tập và gợi ý AI (BR-26, cần lịch sử 30 ngày) có dữ liệu có nghĩa.
        var pastEnrollments = await db.Enrollments
            .Include(e => e.Session)
            .Where(e => e.Session!.EndAtUtc <= now)
            .ToListAsync(ct);

        var index = 0;

        foreach (var enrollment in pastEnrollments)
        {
            var status = index % 5 == 4 ? AttendanceStatus.NoShow : AttendanceStatus.Present;

            db.Attendances.Add(new Attendance
            {
                AttendanceId = Guid.NewGuid(),
                EnrollmentId = enrollment.EnrollmentId,
                Status = status,
                CheckInTime = status == AttendanceStatus.Present ? enrollment.Session!.StartAtUtc : null,

                // NoShow do tiến trình tự động sinh nên không có người thực hiện (BR-53).
                CheckedInByUserId = null
            });

            index++;
        }

        _ = members;
    }

    private async Task SeedTrainingAsync(
        UserAccount[] members,
        UserAccount coachYoga,
        UserAccount coachGroupX,
        UserAccount coachPt,
        Class[] classes,
        DateTime now,
        CancellationToken ct)
    {
        var goals = new[]
        {
            ("Giảm cân 5kg trong 3 tháng", ExperienceLevel.Beginner),
            ("Tăng cơ và cải thiện sức bền", ExperienceLevel.Intermediate),
            ("Tăng độ dẻo dai, giảm đau lưng", ExperienceLevel.Beginner),
            ("Chuẩn bị thi đấu bán chuyên", ExperienceLevel.Advanced),
            ("Duy trì thể lực, tập đều 3 buổi/tuần", ExperienceLevel.Intermediate)
        };

        for (var i = 0; i < goals.Length && i < members.Length; i++)
        {
            db.MemberTrainingProfiles.Add(new MemberTrainingProfile
            {
                ProfileId = Guid.NewGuid(),
                MemberId = members[i].UserId,
                Goal = goals[i].Item1,
                ExperienceLevel = goals[i].Item2,
                Notes = i == 2 ? "Từng chấn thương lưng dưới, tránh bài gập bụng nặng." : null,
                UpdatedAt = now.AddDays(-5)
            });
        }

        var relationships = new[]
        {
            new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                CoachId = coachPt.UserId,
                MemberId = members[2].UserId,
                SourceType = RelationshipSourceType.Personal,
                Status = RelationshipStatus.Active,
                StartedAt = now.AddDays(-20)
            },
            new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                CoachId = coachYoga.UserId,
                MemberId = members[0].UserId,
                SourceType = RelationshipSourceType.ClassBased,
                ClassId = classes[0].ClassId,
                Status = RelationshipStatus.Active,
                StartedAt = now.AddDays(-18)
            },
            new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                CoachId = coachGroupX.UserId,
                MemberId = members[1].UserId,
                SourceType = RelationshipSourceType.ClassBased,
                ClassId = classes[1].ClassId,
                Status = RelationshipStatus.Active,
                StartedAt = now.AddDays(-15)
            }
        };

        db.CoachMemberRelationships.AddRange(relationships);
        await db.SaveChangesAsync(ct);

        var plan = new WorkoutPlan
        {
            PlanId = Guid.NewGuid(),
            MemberId = members[2].UserId,
            CoachId = coachPt.UserId,
            RelationshipId = relationships[0].RelationshipId,
            Goal = "Tăng độ dẻo dai, giảm đau lưng",
            Level = nameof(ExperienceLevel.Beginner),
            CreatedAt = now.AddDays(-14)
        };

        db.WorkoutPlans.Add(plan);

        db.WorkoutPlanItems.AddRange(
            new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(), PlanId = plan.PlanId,
                Exercise = "Cat-cow stretch", Sets = 3, Reps = 12, Notes = "Thở đều, không gồng cổ"
            },
            new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(), PlanId = plan.PlanId,
                Exercise = "Bird dog", Sets = 3, Reps = 10, Notes = "Giữ 2 giây mỗi bên"
            },
            new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(), PlanId = plan.PlanId,
                Exercise = "Glute bridge", Sets = 3, Reps = 15, Notes = null
            });

        // Kết quả tập cho một buổi Yoga đã hoàn thành mà hội viên có mặt — đúng điều kiện
        // BR-24 (HLV thật sự dạy buổi đó) và BR-61 (Enrollment còn Confirmed).
        var yogaEnrollment = await db.Enrollments
            .Include(e => e.Session)
            .Where(e => e.MemberId == members[0].UserId
                        && e.Status == EnrollmentStatus.Confirmed
                        && e.Session!.EndAtUtc <= now
                        && e.Session.CoachId == coachYoga.UserId)
            .OrderByDescending(e => e.Session!.StartAtUtc)
            .FirstOrDefaultAsync(ct);

        if (yogaEnrollment is not null)
        {
            db.WorkoutResults.Add(new WorkoutResult
            {
                ResultId = Guid.NewGuid(),
                EnrollmentId = yogaEnrollment.EnrollmentId,
                CoachId = coachYoga.UserId,
                ProgressNote = "Giữ được tư thế chiến binh II trong 45 giây, tiến bộ so với tuần trước.",
                CoachComment = "Cần thả lỏng vai hơn khi vào tư thế. Buổi sau tăng thời gian giữ lên 60 giây.",
                RecordedAt = yogaEnrollment.Session!.EndAtUtc.AddMinutes(10)
            });
        }
    }

    private async Task SeedGymCheckInsAsync(
        UserAccount[] members,
        UserAccount reception,
        DateTime now,
        CancellationToken ct)
    {
        // Chỉ check-in cho hội viên có gói Active (BR-64).
        var eligible = await db.MemberPackages
            .Where(mp => mp.Status == MemberPackageStatus.Active)
            .Select(mp => mp.MemberId)
            .Distinct()
            .ToListAsync(ct);

        foreach (var memberId in eligible)
        {
            for (var day = 1; day <= 8; day++)
            {
                db.GymCheckIns.Add(new GymCheckIn
                {
                    CheckInId = Guid.NewGuid(),
                    MemberId = memberId,
                    CheckedInByUserId = reception.UserId,
                    CheckInTime = now.AddDays(-day).AddHours(-2)
                });
            }
        }

        _ = members;
    }

    private UserAccount NewUser(string email, string fullName, string phone, UserRole role)
    {
        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow.AddDays(-60),

            // Băm bằng đúng hasher của ứng dụng (BR-5) — tài khoản demo đăng nhập như thật.
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(DemoPassword) },
            Profile = new UserProfile { FullName = fullName, Phone = phone }
        };

        _roleByUser[user] = role;

        return user;
    }

    private readonly Dictionary<UserAccount, UserRole> _roleByUser = [];

    private UserRole RoleOf(UserAccount user) => _roleByUser[user];
}
