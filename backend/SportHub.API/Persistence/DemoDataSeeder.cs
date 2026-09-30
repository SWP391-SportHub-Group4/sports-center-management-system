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
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Rules;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Threshold.Domain;
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

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var now = clock.UtcNow;
        var today = VietnamTime.TodayLocal(clock);

        var roles = await db.Roles.ToDictionaryAsync(r => r.RoleName, ct);

        var admin = NewUser("admin@sporthub.vn", "Nguyễn Quản Trị", "0901000001", UserRole.SystemAdministrator);
        var manager = NewUser("manager@sporthub.vn", "Trần Thu Quản Lý", "0901000002", UserRole.CenterManager);
        var reception = NewUser("letan@sporthub.vn", "Lê Thị Lễ Tân", "0901000003", UserRole.Receptionist);

        var coachYoga = NewUser("coach.yoga@sporthub.vn", "Phạm Minh Yoga", "0902000001", UserRole.Coach);
        var coachGroupX = NewUser("coach.groupx@sporthub.vn", "Vũ Hải Group X", "0902000002", UserRole.Coach);
        var coachPt = NewUser("coach.pt@sporthub.vn", "Đỗ Quang PT", "0902000003", UserRole.Coach);

        var externalApproved = NewUser("coach.external.approved@sporthub.vn", "Huấn Luyện Viên Sân Đã Duyệt", "0902000011", UserRole.ExternalCoach);
        var externalPending = NewUser("coach.external.pending@sporthub.vn", "Huấn Luyện Viên Sân Chờ Duyệt", "0902000012", UserRole.ExternalCoach);
        var externalRejected = NewUser("coach.external.rejected@sporthub.vn", "Huấn Luyện Viên Sân Bị Từ Chối", "0902000013", UserRole.ExternalCoach);
        var externalSuspended = NewUser("coach.external.suspended@sporthub.vn", "Huấn Luyện Viên Sân Tạm Ngưng", "0902000014", UserRole.ExternalCoach);

        var externalProfiles = new[]
        {
            new ExternalCoachProfile
            {
                UserId = externalApproved.UserId, Bio = "ExternalCoach demo đã được duyệt để kiểm thử đặt sân.",
                ApprovalStatus = ExternalCoachApprovalStatus.Approved, ReviewedByUserId = manager.UserId,
                ReviewedAt = now, CreatedAt = now.AddDays(-3)
            },
            new ExternalCoachProfile
            {
                UserId = externalPending.UserId, Bio = "ExternalCoach demo đang chờ duyệt.",
                ApprovalStatus = ExternalCoachApprovalStatus.PendingApproval, CreatedAt = now
            },
            new ExternalCoachProfile
            {
                UserId = externalRejected.UserId, Bio = "ExternalCoach demo bị từ chối.",
                ApprovalStatus = ExternalCoachApprovalStatus.Rejected, ReviewedByUserId = manager.UserId,
                ReviewedAt = now, ReviewNote = "Thiếu thông tin chuyên môn.", CreatedAt = now.AddDays(-5)
            },
            new ExternalCoachProfile
            {
                UserId = externalSuspended.UserId, Bio = "ExternalCoach demo tạm ngưng.",
                ApprovalStatus = ExternalCoachApprovalStatus.Suspended, ReviewedByUserId = manager.UserId,
                ReviewedAt = now, ReviewNote = "Tạm ngưng để rà soát hồ sơ.", CreatedAt = now.AddDays(-10)
            }
        };

        // BR-96 — mỗi tài khoản Coach demo có CoachProfile ngay khi tạo; chuyên môn theo môn gán ngay sau khi lưu user.
        coachYoga.CoachProfile = new CoachProfile();
        coachGroupX.CoachProfile = new CoachProfile();
        coachPt.CoachProfile = new CoachProfile();

        var members = new[]
        {
            NewUser("an.member@sporthub.vn", "Hồ Lê Thiên An", "0903000001", UserRole.Member),
            NewUser("binh.member@sporthub.vn", "Nguyễn Thanh Bình", "0903000002", UserRole.Member),
            NewUser("chi.member@sporthub.vn", "Lý Bảo Chi", "0903000003", UserRole.Member),
            NewUser("dung.member@sporthub.vn", "Trịnh Tiến Dũng", "0903000004", UserRole.Member),
            NewUser("giang.member@sporthub.vn", "Mai Hương Giang", "0903000005", UserRole.Member),
            NewUser("hoa.member@sporthub.vn", "Bùi Thanh Hoa", "0903000006", UserRole.Member)
        };

        var allUsers = new List<UserAccount> { admin, manager, reception, coachYoga, coachGroupX, coachPt,
            externalApproved, externalPending, externalRejected, externalSuspended };
        allUsers.AddRange(members);

        foreach (var user in allUsers)
        {
            user.RoleId = roles[RoleOf(user)].RoleId;
        }

        db.UserAccounts.AddRange(allUsers);
        await db.SaveChangesAsync(ct);
        db.ExternalCoachProfiles.AddRange(externalProfiles);
        await db.SaveChangesAsync(ct);

        // Chuyên môn demo (sport 2 = Personal Training, 3 = Cầu lông, 4 = Bóng rổ; seed trong migration catalog).
        // Mapping cụ thể theo user vì CoachCategory cũ không đủ xác định môn.
        db.UserSportSpecialties.AddRange(
            new UserSportSpecialty { UserId = coachYoga.UserId, SportId = 3 },
            new UserSportSpecialty { UserId = coachGroupX.UserId, SportId = 4 },
            new UserSportSpecialty { UserId = coachPt.UserId, SportId = 2 },
            new UserSportSpecialty { UserId = externalApproved.UserId, SportId = 3 },
            new UserSportSpecialty { UserId = externalPending.UserId, SportId = 3 });
        await db.SaveChangesAsync(ct);

        members[^1].Status = UserStatus.Deactivated;
        // Loại phòng seed trong migration catalog: 1 Phòng Gym, 2 Phòng PT, 3 Sân cầu lông, 4 Sân bóng rổ.
        var rooms = new[]
        {
            new Room { Name = "Sân cầu lông 1", Capacity = 12, RoomTypeId = 3 },
            new Room { Name = "Sân bóng rổ 1", Capacity = 30, RoomTypeId = 4 },
            new Room { Name = "Phòng PT 1", Capacity = 2, RoomTypeId = 2 },
            new Room { Name = "Khu Gym tự do", Capacity = 80, RoomTypeId = 1 }
        };

        db.Rooms.AddRange(rooms);
        await db.SaveChangesAsync(ct);

        // Giờ mở cửa 06:00–22:00 mọi ngày (giờ VN).
        db.RoomOpeningHours.AddRange(rooms.SelectMany(r => Enumerable.Range(0, 7).Select(d => new RoomOpeningHour
        {
            RoomId = r.RoomId, DayOfWeek = d, OpenTimeLocal = new TimeOnly(6, 0), CloseTimeLocal = new TimeOnly(22, 0)
        })));

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

        // Khóa học demo theo mô hình v3: một khóa Cầu lông đã publish (đủ buổi + chiếm phòng/coach) và một khóa Bóng rổ ở Draft.
        // Ghi danh demo KHÔNG đi qua thanh toán (InvoiceItemId để trống) — chỉ để có dữ liệu xem; ghi danh thật chỉ sinh từ checkout.
        var sessionCount = await SeedCoursesAsync(rooms, coachYoga, coachGroupX, members, today, now, ct);

        await SeedPackagesAndInvoicesAsync(members, manager, reception, packages, today, now, ct);
        await SeedTrainingAsync(members, manager, coachYoga, coachGroupX, coachPt, now, ct);
        await SeedGymCheckInsAsync(members, reception, now, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        logger.LogInformation(
            "Đã seed dữ liệu demo: {Users} tài khoản, {Sessions} buổi học. Mật khẩu chung: {Password}",
            allUsers.Count, sessionCount, DemoPassword);
    }

    private async Task<int> SeedCoursesAsync(
        Room[] rooms,
        UserAccount coachBadminton,
        UserAccount coachBasketball,
        UserAccount[] members,
        DateOnly today,
        DateTime now,
        CancellationToken ct)
    {
        // Ngày bắt đầu: thứ Hai gần nhất trong tương lai (>= 7 ngày nữa) để khóa còn nhận ghi danh.
        var start = today.AddDays(7);
        while (start.DayOfWeek != DayOfWeek.Monday)
        {
            start = start.AddDays(1);
        }

        var badminton = new Class
        {
            Code = "CAULONG-01",
            Name = "Cầu lông 01",
            SportId = 3,
            CoachId = coachBadminton.UserId,
            DefaultRoomId = rooms[0].RoomId,
            StartDate = start,
            NumSessions = 6,
            Capacity = 12,
            Price = 900_000m,
            CostAmount = 4_500_000m,
            BreakEvenThreshold = 5,
            ThresholdStatus = ThresholdStatus.NotEvaluated,
            Status = ClassStatus.Published,
            CreatedAt = now,
            PublishedAt = now,
            Version = 2
        };

        var basketball = new Class
        {
            Code = "BONGRO-01",
            Name = "Bóng rổ 01",
            SportId = 4,
            CoachId = coachBasketball.UserId,
            DefaultRoomId = rooms[1].RoomId,
            StartDate = start.AddDays(1),
            NumSessions = 8,
            Capacity = 20,
            Price = 1_200_000m,
            CostAmount = 9_600_000m,
            ThresholdStatus = ThresholdStatus.NotEvaluated,
            Status = ClassStatus.Draft,
            CreatedAt = now,
            Version = 1
        };

        db.Classes.AddRange(badminton, basketball);
        await db.SaveChangesAsync(ct);

        var mon = new TimeOnly(18, 0);
        db.ClassScheduleRules.AddRange(
            new ClassScheduleRule { ClassId = badminton.ClassId, DayOfWeek = (int)DayOfWeek.Monday, StartTimeLocal = mon },
            new ClassScheduleRule { ClassId = badminton.ClassId, DayOfWeek = (int)DayOfWeek.Wednesday, StartTimeLocal = mon },
            new ClassScheduleRule { ClassId = badminton.ClassId, DayOfWeek = (int)DayOfWeek.Friday, StartTimeLocal = mon },
            new ClassScheduleRule { ClassId = basketball.ClassId, DayOfWeek = (int)DayOfWeek.Tuesday, StartTimeLocal = new TimeOnly(19, 0) },
            new ClassScheduleRule { ClassId = basketball.ClassId, DayOfWeek = (int)DayOfWeek.Thursday, StartTimeLocal = new TimeOnly(19, 0) });

        var generated = CourseRules.GenerateSessions(
            badminton.StartDate,
            badminton.NumSessions,
            [((int)DayOfWeek.Monday, mon), ((int)DayOfWeek.Wednesday, mon), ((int)DayOfWeek.Friday, mon)],
            sessionMinutes: 90);

        var sessions = generated.Select(g => new ClassSession
        {
            SessionId = Guid.NewGuid(),
            ClassId = badminton.ClassId,
            SessionNo = g.SessionNo,
            RoomId = badminton.DefaultRoomId,
            CoachId = coachBadminton.UserId,
            StartAtUtc = g.StartAtUtc,
            EndAtUtc = g.EndAtUtc,
            Status = ClassSessionStatus.Scheduled
        }).ToList();

        db.ClassSessions.AddRange(sessions);

        // Chiếm phòng + coach cho từng buổi (nguồn ClassSession) như publish thật.
        db.RoomOccupancies.AddRange(sessions.Select(s => new RoomOccupancy
        {
            OccupancyId = Guid.NewGuid(), RoomId = s.RoomId, SourceType = OccupancySourceType.ClassSession, SourceId = s.SessionId,
            StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
        }));
        db.CoachOccupancies.AddRange(sessions.Select(s => new CoachOccupancy
        {
            OccupancyId = Guid.NewGuid(), CoachId = s.CoachId, SourceType = OccupancySourceType.ClassSession, SourceId = s.SessionId,
            StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
        }));

        // Ba ghi danh demo đầu tiên; bộ đếm khớp (confirmed = reserved).
        var enrolled = members.Take(3).ToList();
        db.Enrollments.AddRange(enrolled.Select(m => new Enrollment
        {
            EnrollmentId = Guid.NewGuid(),
            ClassId = badminton.ClassId,
            MemberId = m.UserId,
            Status = EnrollmentStatus.Confirmed,
            EnrolledAt = now.AddDays(-1)
        }));

        badminton.ConfirmedCount = enrolled.Count;
        badminton.ReservedCount = enrolled.Count;
        badminton.ThresholdDeadlineUtc = sessions[0].StartAtUtc.AddDays(-3);

        await db.SaveChangesAsync(ct);

        return sessions.Count;
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

    private async Task SeedTrainingAsync(
        UserAccount[] members,
        UserAccount manager,
        UserAccount coachYoga,
        UserAccount coachGroupX,
        UserAccount coachPt,

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

        // Đổi 29/09/2026 (BE-4): PT dùng PtEntitlement/PtSession riêng, không còn ép
        // WorkoutResult vào Enrollment Yoga/Group X. Entitlement mượn validity của MemberPackage
        // "Personal Training 10 buổi" đã seed cho members[2] ở SeedPackagesAndInvoicesAsync —
        // đây là dữ liệu demo, Payment thật sẽ tạo PtEntitlement qua IPtEntitlementLifecycle.
        var ptMemberPackage = await db.MemberPackages
            .Where(mp => mp.MemberId == members[2].UserId && mp.Status == MemberPackageStatus.Active)
            .OrderByDescending(mp => mp.StartDate)
            .FirstOrDefaultAsync(ct);

        if (ptMemberPackage is not null)
        {
            var entitlement = new PtEntitlement
            {
                EntitlementId = Guid.NewGuid(),
                ActivationReference = Guid.NewGuid(),
                MemberId = members[2].UserId,
                OriginMemberPackageId = ptMemberPackage.MemberPackageId,
                CurrentMemberPackageId = ptMemberPackage.MemberPackageId,
                CoachId = coachPt.UserId,
                FrequencyPerWeek = 2,
                TotalQuota = 24,
                ReservedSessions = 0,
                ConsumedSessions = 1,
                ValidityStartDate = ptMemberPackage.StartDate,
                ValidityEndDate = ptMemberPackage.EndDate,
                CarryOverUntilDate = ptMemberPackage.EndDate.AddDays(30),
                Status = PtEntitlementStatus.Active,
                // DateOnly.ToDateTime() luôn trả Kind=Unspecified — cột là timestamptz nên phải
                // ép rõ Utc, nếu không Npgsql ném ArgumentException lúc ghi (phát hiện qua test).
                ActivatedAt = DateTime.SpecifyKind(ptMemberPackage.StartDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc),
                Version = 0
            };

            db.PtEntitlements.Add(entitlement);

            var sessionStartUtc = now.AddDays(-7);

            var session = new PtSession
            {
                SessionId = Guid.NewGuid(),
                EntitlementId = entitlement.EntitlementId,
                MemberId = members[2].UserId,
                CoachId = coachPt.UserId,
                StartAtUtc = sessionStartUtc,
                EndAtUtc = sessionStartUtc.AddMinutes(90),
                Status = PtSessionStatus.Completed,
                QuotaState = PtSessionQuotaState.Consumed,
                CreatedByUserId = manager.UserId,
                CompletedAt = sessionStartUtc.AddMinutes(90),
                Version = 0
            };

            db.PtSessions.Add(session);

            db.WorkoutResults.Add(new WorkoutResult
            {
                ResultId = Guid.NewGuid(),
                PtSessionId = session.SessionId,
                CoachId = coachPt.UserId,
                ProgressNote = "Giữ được tư thế plank thêm 15 giây so với buổi trước.",
                CoachComment = "Cần siết cơ bụng nhiều hơn khi vào plank. Buổi sau tăng thời gian giữ.",
                RecordedAt = session.EndAtUtc.AddMinutes(10)
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
