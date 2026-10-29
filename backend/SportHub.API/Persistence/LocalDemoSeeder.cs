using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Persistence;

/// <summary>
/// Additive fixture for the existing local database. Never changes an existing account or password.
/// Only Development and a local PostgreSQL host can call this through Program.cs.
/// </summary>
public sealed class LocalDemoSeeder(SportHubDbContext db, IPasswordHasher passwords,
    IClassService classes, IClock clock,
    ILogger<LocalDemoSeeder> logger)
{
    private const string Prefix = "LOCAL-DEMO-20261028";
    private static readonly DateOnly FirstDay = new(2026, 10, 28);
    private sealed record CoursePlan(string Code, string Name, string SportCode, string RoomName,
        string CoachEmail, string Time, int Capacity, decimal Price);

    private static readonly CoursePlan[] CoursePlans =
    [
        new($"{Prefix}-BAD-01", "Badminton 01", "badminton", "Badminton Class BC1", "coach.caulong@sporthub.vn", "07:00", 5, 900_000),
        new($"{Prefix}-BAD-02", "Badminton 02", "badminton", "Badminton Class BC2", "coach.caulong@sporthub.vn", "14:00", 5, 900_000),
        new($"{Prefix}-BASK-01", "Basketball 01", "basketball", "Basketball Class KC1", "coach.bongro@sporthub.vn", "07:00", 7, 1_200_000),
        new($"{Prefix}-BASK-02", "Basketball 02", "basketball", "Basketball Class KC2", "coach.bongro@sporthub.vn", "14:00", 7, 1_200_000)
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var demoCodes = CoursePlans.Select(p => p.Code).ToArray();
        if (VietnamTime.TodayLocal(clock) > FirstDay
            && await db.Set<Class>().CountAsync(x => demoCodes.Contains(x.Code), ct) < CoursePlans.Length)
            throw new InvalidOperationException("The 28/10/2026 class fixture is in the past; choose a new demo start date before seeding.");

        var manager = await UserAsync("nnkhoa1999@gmail.com", UserRole.CenterManager, ct);
        var desk = await UserAsync("letan@sporthub.vn", UserRole.Receptionist, ct);
        foreach (var plan in CoursePlans)
            _ = await UserAsync(plan.CoachEmail, UserRole.Coach, ct);

        await SeedMembersAndCatalogAsync(ct);
        await SeedCoachCredentialsAsync(ct);
        await SeedCourtRatesAsync(ct);
        foreach (var plan in CoursePlans)
            await SeedCourseAsync(plan, manager.UserId, ct);
        await SeedMemberScenariosAsync(manager.UserId, desk.UserId, ct);
        await EnsureDemoCashPaymentsAsync(desk.UserId, ct);
        logger.LogInformation("Local demo fixture ready on {Database}. Existing accounts and passwords were preserved.",
            db.Database.GetDbConnection().Database);
    }

    private async Task<UserAccount> UserAsync(string email, UserRole role, CancellationToken ct)
    {
        var user = await db.Set<UserAccount>().Include(x => x.Role)
            .SingleOrDefaultAsync(x => x.Email == email, ct)
            ?? throw new InvalidOperationException($"Required existing {role} account is missing: {email}.");
        if (user.Role?.RoleName != role || user.Status != UserStatus.Active)
            throw new InvalidOperationException($"Required {role} account is not active with the expected role: {email}.");
        return user;
    }

    private async Task SeedMembersAndCatalogAsync(CancellationToken ct)
    {
        var specs = new[]
        {
            ("binh.member@sporthub.vn", "Member Binh"),
            ("khoi.member@sporthub.vn", "Member Khoi"),
            ("hao.member@sporthub.vn", "Member Hao"),
            ("khoa.member@sporthub.vn", "Member Khoa")
        };
        var password = Environment.GetEnvironmentVariable("LocalDemoSeed__Password");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12)
            throw new InvalidOperationException("Set LocalDemoSeed__Password to the 12+ character local demo password.");
        var memberRoleId = await db.Set<Role>().Where(x => x.RoleName == UserRole.Member)
            .Select(x => x.RoleId).SingleAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var (email, name) in specs)
        {
            var existing = await db.Set<UserAccount>().Include(x => x.Credential)
                .Include(x => x.Role).SingleOrDefaultAsync(x => x.Email == email, ct);
            if (existing is not null)
            {
                if (existing.Role?.RoleName != UserRole.Member || existing.Credential is null)
                    throw new InvalidOperationException($"Demo Member {email} has an incompatible existing account.");
                if (!passwords.Verify(password, existing.Credential.PasswordHash!))
                {
                    existing.Credential.PasswordHash = passwords.Hash(password);
                    existing.SecurityStamp = Guid.NewGuid();
                }
                continue;
            }
            var user = new UserAccount
            {
                UserId = Guid.NewGuid(), Email = email, RoleId = memberRoleId,
                Status = UserStatus.Active, CreatedAt = clock.UtcNow,
                Profile = new UserProfile { FullName = name },
                Credential = new UserCredential { PasswordHash = passwords.Hash(password!) }
            };
            db.Set<UserAccount>().Add(user);
            db.Set<PointWallet>().Add(new PointWallet
            {
                WalletId = Guid.NewGuid(), OwnerUserId = user.UserId, CreatedAtUtc = clock.UtcNow
            });
        }
        foreach (var (name, original) in new[]
        {
            ("Gym 6 months", 3_600_000m), ("Gym 12 months", 7_200_000m)
        })
        {
            var package = await db.Set<MembershipPackage>().SingleAsync(x => x.Name == name, ct);
            package.OriginalPrice = original;
            package.IsActive = true;
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task SeedCourtRatesAsync(CancellationToken ct)
    {
        foreach (var (name, price) in new[]
        {
            ("Badminton Rental BR1", 100_000m), ("Basketball Rental KR1", 200_000m)
        })
        {
            var room = await db.Set<Room>().SingleAsync(x => x.Name == name, ct);
            if (!room.IsActive || !room.AllowRental || room.RoomTypeId is null)
                throw new InvalidOperationException($"Rental room {name} must be active and allow rental.");
            var rate = await db.Set<CourtRate>().SingleOrDefaultAsync(x => x.RoomId == room.RoomId, ct);
            if (rate is null)
            {
                db.Set<CourtRate>().Add(new CourtRate
                {
                    RoomId = room.RoomId, RoomTypeId = room.RoomTypeId.Value,
                    DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN",
                    StartTimeLocal = new TimeOnly(6, 0), EndTimeLocal = new TimeOnly(22, 0),
                    PricePerHour = price, IsActive = true
                });
            }
            else if (rate.PricePerHour != price || !rate.IsActive)
                throw new InvalidOperationException($"Existing room-specific rate for {name} differs from the demo price; review it before seeding.");
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedCoachCredentialsAsync(CancellationToken ct)
    {
        foreach (var (email, title, file) in new[]
        {
            ("coach.caulong@sporthub.vn", "Badminton Coaching Fundamentals — DEMO SAMPLE", "badminton-sample.svg"),
            ("coach.bongro@sporthub.vn", "Basketball Coaching Fundamentals — DEMO SAMPLE", "basketball-sample.svg")
        })
        {
            var coach = await UserAsync(email, UserRole.Coach, ct);
            if (await db.Set<CoachCredential>().AnyAsync(x => x.CoachUserId == coach.UserId
                && x.FilePublicId == $"local-demo/{file}", ct)) continue;
            db.Set<CoachCredential>().Add(new CoachCredential
            {
                CredentialId = Guid.NewGuid(), CoachUserId = coach.UserId,
                Kind = CoachCredentialKind.Certificate, Title = title,
                Issuer = "SportHub interface demo — not verified",
                IssuedOn = FirstDay.AddDays(-1), FileName = file,
                FileUrl = $"/demo-certificates/{file}", FilePublicId = $"local-demo/{file}",
                ContentType = "image/svg+xml", SizeBytes = 2000, IsPublished = true,
                CreatedAtUtc = clock.UtcNow, UpdatedAtUtc = clock.UtcNow, Version = 1
            });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedCourseAsync(CoursePlan plan, Guid managerId, CancellationToken ct)
    {
        if (await db.Set<Class>().AnyAsync(x => x.Code == plan.Code, ct)) return;
        var sport = await db.Set<Sport>().SingleAsync(x => x.Code == plan.SportCode, ct);
        var room = await db.Set<Room>().SingleAsync(x => x.Name == plan.RoomName, ct);
        var coach = await UserAsync(plan.CoachEmail, UserRole.Coach, ct);
        if (!await db.Set<UserSportSpecialty>().AnyAsync(x => x.UserId == coach.UserId && x.SportId == sport.SportId, ct))
            throw new InvalidOperationException($"Coach {plan.CoachEmail} needs the {plan.SportCode} specialty.");
        var created = await classes.CreateAsync(new SaveClassRequest
        {
            Code = plan.Code, Name = plan.Name, SportId = sport.SportId,
            CoachId = coach.UserId, DefaultRoomId = room.RoomId,
            StartDate = FirstDay, NumSessions = 12, SessionMinutes = 120,
            Capacity = plan.Capacity, Price = plan.Price,
            // One enrolled Member can satisfy the threshold before the near-term start.
            CostAmount = plan.Price,
            ScheduleRules = new[] { 1, 3, 5 }.Select(day => new ScheduleRuleInput
            { DayOfWeek = day, StartTimeLocal = plan.Time }).ToList()
        }, managerId, ct);
        await classes.PublishAsync(created.ClassId,
            new PublishClassRequest { ExpectedVersion = created.Version }, managerId, ct);
    }

    private async Task SeedMemberScenariosAsync(Guid managerId, Guid deskId, CancellationToken ct)
    {
        var members = await db.Set<UserAccount>().Where(x =>
            x.Email == "binh.member@sporthub.vn" || x.Email == "khoi.member@sporthub.vn"
            || x.Email == "hao.member@sporthub.vn" || x.Email == "khoa.member@sporthub.vn")
            .ToDictionaryAsync(x => x.Email, ct);
        var binh = members["binh.member@sporthub.vn"];
        var khoi = members["khoi.member@sporthub.vn"];
        var hao = members["hao.member@sporthub.vn"];
        var khoa = members["khoa.member@sporthub.vn"];
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var gym = await db.Set<MembershipPackage>().SingleAsync(x => x.Name == "Gym 1 month", ct);
        var binhInvoice = await MembershipAsync(binh, gym, deskId, ct);
        _ = await MembershipAsync(khoa, gym, deskId, ct);
        var bad = await db.Set<Class>().SingleAsync(x => x.Code == $"{Prefix}-BAD-01", ct);
        var badSecond = await db.Set<Class>().SingleAsync(x => x.Code == $"{Prefix}-BAD-02", ct);
        var basket = await db.Set<Class>().SingleAsync(x => x.Code == $"{Prefix}-BASK-01", ct);
        var basketSecond = await db.Set<Class>().SingleAsync(x => x.Code == $"{Prefix}-BASK-02", ct);
        await EnrollmentAsync(khoi, bad, deskId, ct);
        await EnrollmentAsync(khoi, badSecond, deskId, ct);
        await EnrollmentAsync(hao, basket, deskId, ct);
        await EnrollmentAsync(hao, basketSecond, deskId, ct);
        await RentalAsync(hao, deskId, ct);
        await LatePaymentAsync(hao, deskId, fulfilled: true, ct);
        var unactivatedInvoice = await LatePaymentAsync(khoa, deskId, fulfilled: false, ct);

        await SupportAsync(binh, "PAYMENT", "Review my Gym payment", binhInvoice.InvoiceId, deskId, ct);
        await SupportAsync(khoi, "CLASS", "Question about my badminton class", null, khoi.UserId, ct);
        await SupportAsync(hao, "FACILITY", "Question about the badminton court", null, hao.UserId, ct);
        await SupportAsync(khoa, "MEMBERSHIP", "Question about my Gym plan", null, khoa.UserId, ct);
        await SupportAsync(khoa, "PAYMENT", "Day pass payment not activated", unactivatedInvoice.InvoiceId, deskId, ct);
        await HistoricalTrainingAsync(khoi, deskId, ct);

        var coach = await UserAsync("coach.caulong@sporthub.vn", UserRole.Coach, ct);
        if (!await db.Set<ClassTeachingRecord>().AnyAsync(x => x.ClassId == bad.ClassId
            && x.MemberId == khoi.UserId && x.Kind == "PLAN", ct))
            db.Set<ClassTeachingRecord>().Add(new ClassTeachingRecord
            {
                RecordId = Guid.NewGuid(), ClassId = bad.ClassId, MemberId = khoi.UserId,
                CoachId = coach.UserId, Kind = "PLAN", Title = "Badminton footwork foundation",
                Content = "Warm up, footwork patterns, controlled clears and cool down. Demo plan prepared by the assigned coach.",
                CreatedAtUtc = clock.UtcNow, UpdatedAtUtc = clock.UtcNow, Version = 1
            });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task<Invoice> MembershipAsync(UserAccount member, MembershipPackage package,
        Guid deskId, CancellationToken ct)
    {
        var number = $"{Prefix}-GYM-{member.Email.Split('@')[0]}";
        var existing = await db.Set<Invoice>().SingleOrDefaultAsync(x => x.InvoiceNumber == number, ct);
        if (existing is not null) return existing;
        var today = VietnamTime.TodayLocal(clock);
        var entitlement = new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(), MemberId = member.UserId, PackageId = package.PackageId,
            StartDate = today, EndDate = today.AddDays(package.DurationDays - 1),
            DurationDaysSnapshot = package.DurationDays, Status = MemberPackageStatus.Active, Version = 1
        };
        var invoice = PaidInvoice(number, member.UserId, deskId, package.Price);
        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(), Invoice = invoice, ItemType = InvoiceItemType.Membership,
            Description = package.Name, UnitPrice = package.Price, Quantity = 1,
            LineAmount = package.Price, RelatedEntityId = entitlement.MemberPackageId,
            MemberPackageId = entitlement.MemberPackageId
        };
        db.Set<MemberPackage>().Add(entitlement);
        db.Set<InvoiceItem>().Add(item);
        await db.SaveChangesAsync(ct);
        entitlement.InvoiceItemId = item.ItemId;
        invoice.MemberPackageId = entitlement.MemberPackageId;
        await db.SaveChangesAsync(ct);
        return invoice;
    }

    private async Task EnrollmentAsync(UserAccount member, Class course, Guid deskId, CancellationToken ct)
    {
        if (await db.Set<Enrollment>().AnyAsync(x => x.ClassId == course.ClassId
            && x.MemberId == member.UserId && x.Status == EnrollmentStatus.Confirmed, ct)) return;
        var number = $"{Prefix}-CLASS-{course.ClassId}-{member.Email.Split('@')[0]}";
        var invoice = PaidInvoice(number, member.UserId, deskId, course.Price);
        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(), Invoice = invoice, ItemType = InvoiceItemType.ClassPackage,
            Description = course.Name, UnitPrice = course.Price, Quantity = 1, LineAmount = course.Price,
            ClassId = course.ClassId, SportId = course.SportId
        };
        db.Set<InvoiceItem>().Add(item);
        db.Set<Enrollment>().Add(new Enrollment
        {
            EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId, MemberId = member.UserId,
            InvoiceItemId = item.ItemId, Status = EnrollmentStatus.Confirmed, EnrolledAt = clock.UtcNow
        });
        course.ConfirmedCount++;
        course.ReservedCount++;
        course.ThresholdStatus = ThresholdStatus.Met;
        await db.SaveChangesAsync(ct);
    }

    private Invoice PaidInvoice(string number, Guid memberId, Guid deskId, decimal amount) => new()
    {
        InvoiceId = Guid.NewGuid(), InvoiceNumber = number, MemberId = memberId,
        IssuedByUserId = deskId, TotalAmount = amount, CashAmount = amount,
        Status = InvoiceStatus.Paid, PaidVia = "CASH", PaidAtUtc = clock.UtcNow,
        IssuedAt = clock.UtcNow
    };

    private async Task EnsureDemoCashPaymentsAsync(Guid deskId, CancellationToken ct)
    {
        var invoices = await db.Set<Invoice>()
            .Where(x => x.InvoiceNumber.StartsWith(Prefix)
                && !x.InvoiceNumber.Contains("-LATE-")
                && x.Status == InvoiceStatus.Paid
                && !db.Set<SportHub.Payment.Domain.Entities.Payment>()
                    .Any(p => p.InvoiceId == x.InvoiceId))
            .ToListAsync(ct);
        foreach (var invoice in invoices)
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new SportHub.Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                Amount = invoice.CashAmount, Method = PaymentMethod.Cash,
                Status = PaymentStatus.Success, ReceivedByUserId = deskId,
                PaidAt = invoice.PaidAtUtc ?? clock.UtcNow,
                ReferenceCode = $"LOCAL-DEMO-CASH-{invoice.InvoiceId:N}"
            });
        await db.SaveChangesAsync(ct);
    }

    private async Task RentalAsync(UserAccount member, Guid deskId, CancellationToken ct)
    {
        var number = $"{Prefix}-RENTAL-{member.Email.Split('@')[0]}";
        if (await db.Set<Invoice>().AnyAsync(x => x.InvoiceNumber == number, ct)) return;
        var room = await db.Set<Room>().SingleAsync(x => x.Name == "Badminton Rental BR1", ct);
        var sport = await db.Set<Sport>().SingleAsync(x => x.Code == "badminton", ct);
        var start = VietnamTime.ToUtc(new DateTime(2026, 10, 29, 18, 0, 0));
        var end = start.AddHours(1);
        if (await db.Set<RoomOccupancy>().AnyAsync(x => x.RoomId == room.RoomId
            && x.IsActive && x.StartAtUtc < end && start < x.EndAtUtc, ct))
            throw new InvalidOperationException("The 29/10 18:00 demo badminton rental slot is already occupied.");
        var rental = new CourtRental
        {
            CourtRentalId = Guid.NewGuid(), MemberId = member.UserId, SportId = sport.SportId,
            RoomId = room.RoomId, StartAtUtc = start, EndAtUtc = end,
            TotalPrice = 100_000, PriceSnapshotJson = "[]", Status = CourtRentalStatus.Confirmed,
            CreatedAtUtc = clock.UtcNow
        };
        var invoice = PaidInvoice(number, member.UserId, deskId, rental.TotalPrice);
        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(), Invoice = invoice, ItemType = InvoiceItemType.Rental,
            Description = "Badminton court rental 29/10 18:00-19:00", UnitPrice = rental.TotalPrice,
            Quantity = 1, LineAmount = rental.TotalPrice, RelatedEntityId = rental.CourtRentalId,
            CourtRentalId = rental.CourtRentalId, SportId = sport.SportId
        };
        db.Set<CourtRental>().Add(rental);
        await db.SaveChangesAsync(ct);
        db.Set<InvoiceItem>().Add(item);
        db.Set<RoomOccupancy>().Add(new RoomOccupancy
        {
            OccupancyId = Guid.NewGuid(), RoomId = room.RoomId,
            SourceType = OccupancySourceType.CourtRental, SourceId = rental.CourtRentalId,
            StartAtUtc = start, EndAtUtc = end, IsActive = true
        });
        await db.SaveChangesAsync(ct);
        rental.InvoiceItemId = item.ItemId;
        rental.InvoiceId = invoice.InvoiceId;
        await db.SaveChangesAsync(ct);
    }

    private async Task HistoricalTrainingAsync(UserAccount member, Guid deskId, CancellationToken ct)
    {
        var course = await db.Set<Class>().SingleOrDefaultAsync(x => x.Code == "CAULONG-STARTED-01", ct);
        if (course is null) return;
        var coach = await UserAsync("coach.caulong@sporthub.vn", UserRole.Coach, ct);
        if (course.CoachId != coach.UserId) return;
        var session = await db.Set<ClassSession>().Where(x => x.ClassId == course.ClassId
            && x.EndAtUtc < clock.UtcNow).OrderBy(x => x.StartAtUtc).FirstOrDefaultAsync(ct);
        if (session is null) return;
        var enrollment = await db.Set<Enrollment>().SingleOrDefaultAsync(x => x.ClassId == course.ClassId
            && x.MemberId == member.UserId && x.Status == EnrollmentStatus.Confirmed, ct);
        if (enrollment is null)
        {
            var number = $"{Prefix}-HISTORY-{member.Email.Split('@')[0]}";
            var invoice = PaidInvoice(number, member.UserId, deskId, course.Price);
            invoice.PaidAtUtc = session.StartAtUtc.AddDays(-2);
            invoice.IssuedAt = invoice.PaidAtUtc.Value;
            var item = new InvoiceItem
            {
                ItemId = Guid.NewGuid(), Invoice = invoice, ItemType = InvoiceItemType.ClassPackage,
                Description = course.Name, UnitPrice = course.Price, Quantity = 1,
                LineAmount = course.Price, ClassId = course.ClassId, SportId = course.SportId
            };
            db.Set<InvoiceItem>().Add(item);
            enrollment = new Enrollment
            {
                EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId, MemberId = member.UserId,
                InvoiceItemId = item.ItemId, Status = EnrollmentStatus.Confirmed,
                EnrolledAt = invoice.PaidAtUtc.Value
            };
            db.Set<Enrollment>().Add(enrollment);
            course.ConfirmedCount++;
            course.ReservedCount++;
            await db.SaveChangesAsync(ct);
        }
        if (!await db.Set<Attendance>().AnyAsync(x => x.EnrollmentId == enrollment.EnrollmentId
            && x.SessionId == session.SessionId, ct))
            db.Set<Attendance>().Add(new Attendance
            {
                AttendanceId = Guid.NewGuid(), EnrollmentId = enrollment.EnrollmentId,
                SessionId = session.SessionId, Status = AttendanceStatus.Present,
                RecordedByUserId = deskId, RecordedAt = session.EndAtUtc
            });
        if (!await db.Set<ClassTeachingRecord>().AnyAsync(x => x.ClassId == course.ClassId
            && x.SessionId == session.SessionId && x.MemberId == member.UserId && x.Kind == "RESULT", ct))
            db.Set<ClassTeachingRecord>().Add(new ClassTeachingRecord
            {
                RecordId = Guid.NewGuid(), ClassId = course.ClassId, SessionId = session.SessionId,
                MemberId = member.UserId, CoachId = coach.UserId, Kind = "RESULT",
                Title = "Footwork and clear practice",
                Content = "Completed the footwork drill and controlled clear exercise. Continue with movement consistency.",
                Score = 4, CreatedAtUtc = session.EndAtUtc, UpdatedAtUtc = session.EndAtUtc, Version = 1
            });
        await db.SaveChangesAsync(ct);
    }

    private async Task<Invoice> LatePaymentAsync(UserAccount member, Guid deskId,
        bool fulfilled, CancellationToken ct)
    {
        var number = $"{Prefix}-LATE-{(fulfilled ? "FULFILLED" : "UNACTIVATED")}";
        var existing = await db.Set<Invoice>().SingleOrDefaultAsync(x => x.InvoiceNumber == number, ct);
        if (existing is not null) return existing;
        var package = await db.Set<MembershipPackage>().SingleAsync(x => x.Name ==
            (fulfilled ? "Gym 3 months" : "Gym day pass"), ct);
        var issuedAt = fulfilled ? clock.UtcNow.AddHours(-3)
            : VietnamTime.ToUtc(new DateTime(2026, 10, 26, 21, 58, 0));
        var paidAt = fulfilled ? clock.UtcNow.AddHours(-1)
            : VietnamTime.ToUtc(new DateTime(2026, 10, 26, 22, 3, 0));
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(), InvoiceNumber = number, MemberId = member.UserId,
            IssuedByUserId = deskId, TotalAmount = package.Price, CashAmount = package.Price,
            Status = InvoiceStatus.PaidAfterReconciliation,
            PaidVia = fulfilled ? "VnPayAfterReconciliation" : "VnPayAwaitingResolution",
            PaidAtUtc = paidAt, IssuedAt = issuedAt, ReconciliationRequired = !fulfilled
        };
        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(), Invoice = invoice, ItemType = InvoiceItemType.Membership,
            Description = $"[DEMO SYNTHETIC] {package.Name}", UnitPrice = package.Price,
            Quantity = 1, LineAmount = package.Price
        };
        db.Set<InvoiceItem>().Add(item);
        await db.SaveChangesAsync(ct);

        var checkout = new CheckoutSession
        {
            CheckoutSessionId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
            Revision = 1, IdempotencyKey = number, Kind = "Membership",
            State = fulfilled ? "Paid" : "Expired", CreatedAtUtc = issuedAt,
            ExpiresAtUtc = issuedAt.AddMinutes(15)
        };
        db.Set<CheckoutSession>().Add(checkout);
        var attempt = new PaymentAttempt
        {
            PaymentAttemptId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
            CheckoutSessionId = checkout.CheckoutSessionId,
            VnpTxnRef = number, Amount = package.Price, CashSnapshot = package.Price,
            VnpExpireDate = checkout.ExpiresAtUtc, Status = PaymentAttemptStatus.Succeeded,
            ProviderTransactionId = $"DEMO-{(fulfilled ? "F" : "U")}-20261027",
            VerifiedResult = fulfilled ? "Paid" : "PaidButUnactivated",
            VerifiedAtUtc = paidAt.AddMinutes(1), CreatedAt = issuedAt
        };
        db.Set<PaymentAttempt>().Add(attempt);
        await db.SaveChangesAsync(ct);
        db.Set<VerifiedGatewayEvent>().Add(new VerifiedGatewayEvent
        {
            VerifiedGatewayEventId = Guid.NewGuid(), PaymentAttemptId = attempt.PaymentAttemptId,
            Provider = "LOCAL_DEMO", ProviderTransactionId = attempt.ProviderTransactionId!,
            TransactionReference = attempt.VnpTxnRef, Amount = package.Price,
            ResponseCode = "00", TransactionStatus = "00", ProviderPaidAtUtc = paidAt,
            VerifiedAtUtc = paidAt.AddMinutes(1),
            ProcessingStatus = fulfilled ? "Fulfilled" : "Unactivated",
            ProcessedAtUtc = paidAt.AddMinutes(2)
        });
        db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new SportHub.Payment.Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
            PaymentAttemptId = attempt.PaymentAttemptId, Amount = package.Price,
            Method = PaymentMethod.VnPay, Status = PaymentStatus.Success,
            ReferenceCode = attempt.ProviderTransactionId,
            ReceivedByUserId = deskId, PaidAt = paidAt
        });
        if (fulfilled)
        {
            var today = VietnamTime.TodayLocal(clock);
            var entitlement = new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = member.UserId, PackageId = package.PackageId,
                StartDate = today, EndDate = today.AddDays(package.DurationDays - 1),
                DurationDaysSnapshot = package.DurationDays, Status = MemberPackageStatus.Active,
                InvoiceItemId = item.ItemId, Version = 1
            };
            db.Set<MemberPackage>().Add(entitlement);
            await db.SaveChangesAsync(ct);
            invoice.MemberPackageId = entitlement.MemberPackageId;
            item.MemberPackageId = entitlement.MemberPackageId;
            item.RelatedEntityId = entitlement.MemberPackageId;
        }
        await db.SaveChangesAsync(ct);
        return invoice;
    }

    private async Task SupportAsync(UserAccount member, string category, string subject,
        Guid? invoiceId, Guid actorId, CancellationToken ct)
    {
        var key = $"[{Prefix}] {subject}";
        if (await db.Set<MemberSupportRequest>().AnyAsync(x => x.MemberId == member.UserId && x.Subject == key, ct)) return;
        var request = new MemberSupportRequest
        {
            RequestId = Guid.NewGuid(), MemberId = member.UserId, RecordedByUserId = actorId,
            Category = category, Subject = key,
            Description = "Local demo request linked to this Member's service and invoice history.",
            Status = "OPEN", Channel = actorId == member.UserId ? "ONLINE" : "COUNTER",
            CreatedAt = clock.UtcNow, SlaDueAtUtc = clock.UtcNow.AddHours(48), InvoiceId = invoiceId
        };
        db.Set<MemberSupportRequest>().Add(request);
        db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = Guid.NewGuid(), RequestId = request.RequestId, ActorUserId = actorId,
            Type = "CREATED", CreatedAt = clock.UtcNow
        });
    }
}
