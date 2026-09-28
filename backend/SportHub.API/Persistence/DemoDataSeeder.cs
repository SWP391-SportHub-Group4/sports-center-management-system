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

public sealed class DemoDataSeeder(
    SportHubDbContext db,
    IPasswordHasher passwordHasher,
    IInvoiceNumberGenerator invoiceNumbers,
    IClock clock,
    ILogger<DemoDataSeeder> logger)
{
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
        var plans = new (UserAccount Member, MembershipPackage Package, bool Paid)[]
        {
            (members[0], packages[1], true),
            (members[0], packages[0], true),
            (members[1], packages[2], true),
            (members[2], packages[3], true),
            (members[3], packages[1], false),
            (members[4], packages[0], false)
        };

        foreach (var plan in plans)
        {
            var memberPackage = new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(),
                MemberId = plan.Member.UserId,
                PackageId = plan.Package.PackageId,
                StartDate = plan.Paid ? today.AddDays(-10) : today,
                EndDate = plan.Paid ? today.AddDays(-10).AddDays(plan.Package.DurationDays - 1) : today,
                RemainingSessions = plan.Package.SessionLimit,
                Status = plan.Paid ? MemberPackageStatus.Active : MemberPackageStatus.PendingPayment
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
                Status = plan.Paid ? InvoiceStatus.Paid : InvoiceStatus.Issued,
                IssuedAt = issuedAt
            };

            db.Invoices.Add(invoice);

            db.InvoiceItems.Add(new InvoiceItem
            {
                ItemId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                ItemType = InvoiceItemType.Membership,
                Description = $"Gói {plan.Package.Name} ({plan.Package.DurationDays} ngày)",
                UnitPrice = plan.Package.Price,
                Quantity = 1,
                LineAmount = plan.Package.Price,
                RelatedEntityId = memberPackage.MemberPackageId
            });

            if (plan.Paid)
            {
                db.Payments.Add(new Payment.Domain.Entities.Payment
                {
                    PaymentId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    Amount = plan.Package.Price,
                    Method = PaymentMethod.Cash,
                    Status = PaymentStatus.Success,
                    ReceivedByUserId = reception.UserId,
                    PaidAt = issuedAt
                });

                db.PaymentAttempts.Add(new PaymentAttempt
                {
                    PaymentAttemptId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    VnpTxnRef = $"SEED-{invoice.InvoiceId:N}",
                    Amount = plan.Package.Price,
                    VnpExpireDate = issuedAt.AddMinutes(15),
                    Status = PaymentAttemptStatus.Succeeded,
                    CreatedAt = issuedAt
                });
            }
        }

        await db.SaveChangesAsync(ct);

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

        var random = new Random(20260921);

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
                    CancellationDeadlineHours = 12
                });

                session.ConfirmedCount += 1;
                package.RemainingSessions -= 1;

                _ = isPast;
            }
        }

        await db.SaveChangesAsync(ct);

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
            },
            new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                CoachId = coachYoga.UserId,
                MemberId = members[3].UserId,
                SourceType = RelationshipSourceType.Personal,
                Status = RelationshipStatus.Active,
                StartedAt = now.AddDays(-10)
            },
            new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                CoachId = coachPt.UserId,
                MemberId = members[0].UserId,
                SourceType = RelationshipSourceType.ClassBased,
                ClassId = classes[0].ClassId,
                Status = RelationshipStatus.Active,
                StartedAt = now.AddDays(-12)
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

        var yogaPlan = new WorkoutPlan
        {
            PlanId = Guid.NewGuid(),
            MemberId = members[3].UserId,
            CoachId = coachYoga.UserId,
            RelationshipId = relationships[3].RelationshipId,
            Goal = "Yoga trị liệu cột sống & Giảm đau thắt lưng",
            Level = nameof(ExperienceLevel.Beginner),
            CreatedAt = now.AddDays(-8)
        };

        db.WorkoutPlans.AddRange(plan, yogaPlan);

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
            },
            new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(), PlanId = yogaPlan.PlanId,
                Exercise = "Child's Pose (Tư thế em bé)", Sets = 3, Reps = 5, Notes = "Giữ mỗi lần 30-45 giây, thở sâu bằng bụng"
            },
            new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(), PlanId = yogaPlan.PlanId,
                Exercise = "Cobra Stretch (Rắn hổ mang)", Sets = 3, Reps = 8, Notes = "Nâng ngực chậm, không nén cột sống thắt lưng"
            },
            new WorkoutPlanItem
            {
                ItemId = Guid.NewGuid(), PlanId = yogaPlan.PlanId,
                Exercise = "Supine Spinal Twist (Vặn mình thư giãn)", Sets = 2, Reps = 10, Notes = "Thả lỏng hai vai sát thảm"
            });

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
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(DemoPassword) },
            Profile = new UserProfile { FullName = fullName, Phone = phone }
        };

        _roleByUser[user] = role;

        return user;
    }

    private readonly Dictionary<UserAccount, UserRole> _roleByUser = [];

    private UserRole RoleOf(UserAccount user) => _roleByUser[user];
}
