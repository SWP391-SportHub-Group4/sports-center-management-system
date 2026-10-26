using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Persistence;

/// <summary>Explicit local fixtures covering operational states. Existing records are never overwritten.</summary>
public sealed class SystemScenarioSeeder(SportHubDbContext db, IClock clock,
    SupportScenarioSeeder support, IPointWalletService wallets, ILogger<SystemScenarioSeeder> logger)
{
    private const string Prefix = "SCN-V1";
    private DateTime Now => clock.UtcNow;
    private DateOnly Today => VietnamTime.TodayLocal(clock);
    private UserAccount[] members = [];
    private UserAccount manager = null!;
    private UserAccount desk = null!;

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var users = await db.UserAccounts.Include(x => x.Role).AsNoTracking()
            .Where(x => x.Status == UserStatus.Active && x.Role != null).OrderBy(x => x.Email).ToListAsync(ct);
        members = users.Where(x => x.Role!.RoleName == UserRole.Member).ToArray();
        manager = users.FirstOrDefault(x => x.Role!.RoleName == UserRole.CenterManager)
            ?? throw new InvalidOperationException("An active Manager is required.");
        desk = users.FirstOrDefault(x => x.Role!.RoleName == UserRole.Receptionist)
            ?? throw new InvalidOperationException("An active Receptionist is required.");
        if (members.Length < 3) throw new InvalidOperationException("At least three active Members are required.");
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026101301)", ct);
            await SeedGymAsync(ct);
            var sports = await db.Set<Sport>().Include(x => x.Services).AsNoTracking()
                .Where(x => x.IsActive).OrderBy(x => x.SportId).ToListAsync(ct);
            foreach (var sport in sports)
            {
                if (sport.Services.Any(x => x.IsEnabled && x.ServiceType == SportServiceType.GroupCourse))
                {
                    var coachIds = await db.UserSportSpecialties.Where(x => x.SportId == sport.SportId)
                        .Select(x => x.UserId).ToListAsync(ct);
                    var coaches = users.Where(x => x.Role!.RoleName == UserRole.Coach && coachIds.Contains(x.UserId)).ToArray();
                    if (coaches.Length > 0) await SeedClassesAsync(sport, coaches, ct);
                    else logger.LogWarning("Skipped class scenarios for {Sport}: no active specialized coach.", sport.Code);
                }
                if (sport.Services.Any(x => x.IsEnabled && x.ServiceType == SportServiceType.CourtRental))
                    await SeedRentalsAsync(sport, ct);
            }
            await SeedWalletScenariosAsync(ct);
            await SeedRequestOutcomesAsync(ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        await support.SeedAsync(ct);
        logger.LogInformation("System scenarios ready. Search classes, packages and rooms for {Prefix}; support requests use [Support seed v1]. Existing accounts, passwords and transactions were preserved. New cash invoice rows are explicitly local fixtures, not gateway confirmations.", Prefix);
    }

    private async Task SeedWalletScenariosAsync(CancellationToken ct)
    {
        for (var i = 0; i < members.Length; i++)
        {
            var number = $"{Prefix}-W{i}";
            if (await db.Invoices.AnyAsync(x => x.InvoiceNumber == number, ct)) continue;
            var member = members[i];
            var item = await InvoiceAsync($"W{i}", member.UserId, 500_000, InvoiceItemType.WalletTopUp,
                null, Now.AddDays(-2), true, ct);
            item.UnitPrice = 1000;
            item.Quantity = 500;
            await wallets.EarnAsync(new(member.UserId, 500, "LocalScenarioTopUp", item.InvoiceId,
                desk.UserId, "Local scenario: 500 points backed by a seeded cash top-up invoice.", item.ItemId), ct);
        }
        var pending = await db.Invoices.Include(x => x.Items)
            .SingleAsync(x => x.InvoiceNumber == Prefix + "-G3", ct);
        var session = await db.Set<CheckoutSession>().SingleAsync(x => x.InvoiceId == pending.InvoiceId, ct);
        if (session.State == "Active" && session.ExpiresAtUtc > Now
            && !await db.Set<PointLedgerEntry>().AnyAsync(x => x.ReferenceType == "CheckoutSession"
                && x.ReferenceId == session.CheckoutSessionId && x.EntryType == PointEntryType.Hold, ct))
        {
            pending.PointsApplied = 200;
            pending.CashAmount = pending.TotalAmount - 200_000;
            await wallets.HoldAsync(new(pending.MemberId, 200, "CheckoutSession", session.CheckoutSessionId,
                pending.MemberId, "Local scenario: points reserved for an unpaid Gym checkout."), ct);
        }
        var seedItem = await db.Set<InvoiceItem>().Include(x => x.Invoice)
            .FirstAsync(x => x.Invoice!.InvoiceNumber.StartsWith(Prefix + "-C") && x.ClassId != null, ct);
        foreach (var status in new[] { PaymentAdjustmentStatus.Requested, PaymentAdjustmentStatus.Rejected })
        {
            var reason = $"{Prefix} refund {status}";
            if (await db.Set<PaymentAdjustment>().AnyAsync(x => x.Reason == reason, ct)) continue;
            db.Set<PaymentAdjustment>().Add(new()
            {
                AdjustmentId = Guid.NewGuid(), InvoiceId = seedItem.InvoiceId, InvoiceItemId = seedItem.ItemId,
                Type = PaymentAdjustmentType.Refund, Status = status, Reason = reason,
                SystemCalculatedPoints = 90, RequestedByUserId = seedItem.Invoice!.MemberId,
                CreatedAt = Now.AddDays(-1), ApprovedByUserId = status == PaymentAdjustmentStatus.Rejected ? manager.UserId : null,
                ApprovedAtUtc = status == PaymentAdjustmentStatus.Rejected ? Now.AddHours(-2) : null,
                ResolvedAt = status == PaymentAdjustmentStatus.Rejected ? Now.AddHours(-2) : null
            });
        }
        var giftReason = Prefix + " pending goodwill credit";
        if (!await db.Set<PointCreditRequest>().AnyAsync(x => x.Reason == giftReason, ct))
            db.Set<PointCreditRequest>().Add(new()
            {
                RequestId = Guid.NewGuid(), OwnerUserId = members[0].UserId, RequestedByUserId = manager.UserId,
                Points = 50, Reason = giftReason, Status = PointCreditRequestStatus.Pending, RequestedAtUtc = Now
            });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedRequestOutcomesAsync(CancellationToken ct)
    {
        var courses = await db.Classes.Where(x => x.Code.StartsWith(Prefix) && x.Status == ClassStatus.InProgress).ToListAsync(ct);
        foreach (var course in courses)
        {
            var sessions = await db.ClassSessions.Where(x => x.ClassId == course.ClassId)
                .OrderBy(x => x.SessionNo).ToListAsync(ct);
            var outcomes = new[] { "REJECTED", "WITHDRAWN", "RESOLVED" };
            for (var i = 0; i < outcomes.Length; i++)
            {
                var status = outcomes[i];
                var reason = $"{Prefix} absence {status}";
                if (await db.Set<ClassSessionChangeRequest>().AnyAsync(x => x.Reason == reason && x.Session.ClassId == course.ClassId, ct)) continue;
                var session = sessions[3 + i];
                db.Set<ClassSessionChangeRequest>().Add(new()
                {
                    RequestId = Guid.NewGuid(), SessionId = session.SessionId,
                    RequestedByUserId = session.CoachId, Type = "ABSENCE", Reason = reason,
                    Status = status, CreatedAtUtc = Now.AddDays(-2), ReviewedAtUtc = Now.AddDays(-1),
                    ReviewedByUserId = status == "WITHDRAWN" ? null : manager.UserId,
                    ReviewNote = status == "REJECTED" ? "Please discuss an alternative arrangement with the manager."
                        : status == "WITHDRAWN" ? "The coach cancelled the request." : "The manager confirmed the current session arrangement.",
                    OriginalStartAtUtc = status == "RESOLVED" ? session.StartAtUtc.AddDays(-1) : session.StartAtUtc,
                    OriginalEndAtUtc = status == "RESOLVED" ? session.EndAtUtc.AddDays(-1) : session.EndAtUtc,
                    OriginalRoomId = session.RoomId, ResultSessionId = status == "RESOLVED" ? session.SessionId : null,
                    ResolutionType = status == "RESOLVED" ? "RESCHEDULE" : null,
                    OutcomeSnapshotJson = status == "RESOLVED" ? JsonSerializer.Serialize(new
                    {
                        action = "RESCHEDULE", sessionId = session.SessionId, sessionNo = session.SessionNo,
                        startAtUtc = session.StartAtUtc, endAtUtc = session.EndAtUtc, coachId = session.CoachId,
                        coachName = (await db.UserAccounts.Include(x => x.Profile).SingleAsync(x => x.UserId == session.CoachId, ct)).Profile?.FullName,
                        roomId = session.RoomId, roomName = (await db.Rooms.SingleAsync(x => x.RoomId == session.RoomId, ct)).Name,
                        handledBy = manager.Profile?.FullName ?? manager.Email,
                        reason = "Local scenario: manager confirmed this rescheduled session.", source = "DECISION",
                        sessionStatus = session.Status.ToString()
                    }) : null
                });
            }
        }
        // A room-specific uncommitted incident fence permits testing recovery without affecting existing rooms.
        var room = await db.Rooms.FirstOrDefaultAsync(x => x.Name.StartsWith(Prefix) && x.AllowRental, ct);
        var fenceReason = Prefix + " court maintenance in progress";
        if (room is not null && !await db.Set<IncidentFence>().AnyAsync(x => x.Reason == fenceReason, ct))
            db.Set<IncidentFence>().Add(new()
            {
                FenceId = Guid.NewGuid(), Scope = IncidentScope.Room, RoomId = room.RoomId,
                StartAtUtc = VietnamTime.StartOfDayUtc(Today.AddDays(1)).AddHours(8),
                EndAtUtc = VietnamTime.StartOfDayUtc(Today.AddDays(1)).AddHours(10),
                Reason = fenceReason, Status = IncidentFenceStatus.Open,
                CreatedByUserId = manager.UserId, CreatedAtUtc = Now, ExpiresAtUtc = Now.AddHours(2)
            });
        await db.SaveChangesAsync(ct);
    }

    private async Task<InvoiceItem> InvoiceAsync(string key, Guid memberId, decimal amount,
        InvoiceItemType type, Guid? relatedId, DateTime paidAt, bool paid, CancellationToken ct,
        int? classId = null, int? sportId = null, Guid? rentalId = null, Guid? packageId = null)
    {
        if (paidAt > Now) paidAt = Now.AddDays(-1);
        var number = $"{Prefix}-{key}";
        var existing = await db.Set<InvoiceItem>().Include(x => x.Invoice)
            .FirstOrDefaultAsync(x => x.Invoice!.InvoiceNumber == number, ct);
        if (existing is not null) return existing;
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(), InvoiceNumber = number, MemberId = memberId,
            IssuedByUserId = desk.UserId, TotalAmount = amount, CashAmount = amount,
            Status = paid ? InvoiceStatus.Paid : InvoiceStatus.Issued, IssuedAt = paidAt,
            PaidAtUtc = paid ? paidAt : null, PaidVia = paid ? "CASH" : null,
            MemberPackageId = packageId
        };
        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(), Invoice = invoice, ItemType = type,
            Description = $"Local system scenario: {key}", UnitPrice = amount, Quantity = 1,
            LineAmount = amount, RelatedEntityId = relatedId, ClassId = classId,
            SportId = sportId, CourtRentalId = rentalId, MemberPackageId = packageId
        };
        db.Set<InvoiceItem>().Add(item);
        if (paid) db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new()
        {
            PaymentId = Guid.NewGuid(), Invoice = invoice, Amount = amount,
            Method = PaymentMethod.Cash, Status = PaymentStatus.Success,
            ReceivedByUserId = desk.UserId, PaidAt = paidAt, ReferenceCode = "LOCAL-SCENARIO"
        });
        await db.SaveChangesAsync(ct);
        return item;
    }

    private async Task SeedGymAsync(CancellationToken ct)
    {
        var cases = new[]
        {
            ("Active", 30, -10, MemberPackageStatus.Active),
            ("Expires tomorrow", 30, -28, MemberPackageStatus.Active),
            ("Expired", 30, -45, MemberPackageStatus.Expired),
            ("Pending payment", 30, 0, MemberPackageStatus.PendingPayment),
            ("Cancelled", 30, -10, MemberPackageStatus.Cancelled),
            ("Future renewal", 30, 20, MemberPackageStatus.Active),
            ("Day pass active", 1, 0, MemberPackageStatus.Active),
            ("Day pass expired", 1, -2, MemberPackageStatus.Expired)
        };
        for (var i = 0; i < cases.Length; i++)
        {
            var (name, days, offset, status) = cases[i];
            var packageName = $"{Prefix} Gym {name}";
            if (await db.MembershipPackages.AnyAsync(x => x.Name == packageName, ct)) continue;
            var package = new MembershipPackage
            {
                Name = packageName, DurationDays = days, Price = days == 1 ? 50_000 : 600_000,
                IsActive = status != MemberPackageStatus.Cancelled,
                Description = "Local scenario for membership status and entitlement checks."
            };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync(ct);
            var member = members[i % members.Length];
            var id = Guid.NewGuid();
            var entitlement = new MemberPackage
            {
                MemberPackageId = id, MemberId = member.UserId, PackageId = package.PackageId,
                StartDate = Today.AddDays(offset), EndDate = Today.AddDays(offset + days - 1),
                DurationDaysSnapshot = days, Status = status, Version = 1,
                ExpiresAtUtc = days == 1 ? Now.AddDays(offset).AddHours(24) : null
            };
            if (days == 1) entitlement.EndDate = DateOnly.FromDateTime(VietnamTime.ToLocal(entitlement.ExpiresAtUtc!.Value));
            db.MemberPackages.Add(entitlement);
            await db.SaveChangesAsync(ct);
            var item = await InvoiceAsync($"G{i}", member.UserId, package.Price, InvoiceItemType.Membership,
                id, days == 1 ? Now.AddDays(offset) : Now.AddDays(Math.Min(offset, -1)), status != MemberPackageStatus.PendingPayment, ct, packageId: id);
            entitlement.InvoiceItemId = item.ItemId;
            if (i == 0)
                for (var day = 0; day < 7; day++) db.GymCheckIns.Add(new GymCheckIn
                {
                    CheckInId = Guid.NewGuid(), MemberId = member.UserId,
                    CheckedInByUserId = desk.UserId, CheckInTime = Now.AddDays(-day).AddHours(-1)
                });
            if (status == MemberPackageStatus.PendingPayment)
                AddCheckout(item.InvoiceId, "Membership", id, Now.AddMinutes(15));
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Gym scenario {Scenario}: {Email}.", name, member.Email);
        }
        foreach (var member in members)
        {
            if (await db.Set<MemberTrainingProfile>().AnyAsync(x => x.MemberId == member.UserId, ct)) continue;
            db.Set<MemberTrainingProfile>().Add(new()
            {
                ProfileId = Guid.NewGuid(), MemberId = member.UserId, Goal = "Improve fitness and sport technique",
                ExperienceLevel = ExperienceLevel.Beginner, Notes = "Local scenario: avoid high impact movements if discomfort occurs.",
                HeightCm = 170, WeightKg = 68, TargetWeightKg = 65, UpdatedAt = Now,
                TrainingDaysPerWeek = 3, SessionMinutes = 60, GoalType = TrainingGoalType.GeneralFitness,
                DateOfBirth = new DateOnly(1998, 1, 1), Sex = BiologicalSex.Unspecified,
                ActivityLevel = ActivityLevel.LightlyActive, DietaryPreference = DietaryPreference.NoPreference
            });
            db.Set<MemberBodyMeasurement>().AddRange(new[] { -30, -14, 0 }.Select((day, index) => new MemberBodyMeasurement
            {
                MeasurementId = Guid.NewGuid(), MemberId = member.UserId,
                HeightCm = 170, WeightKg = 70 - index, MeasuredAt = Now.AddDays(day)
            }));
        }
        await db.SaveChangesAsync(ct);
    }

    private void AddCheckout(Guid invoiceId, string kind, Guid resourceId, DateTime expires, int? classId = null)
    {
        var sessionId = Guid.NewGuid();
        var invoice = db.Invoices.Local.Single(x => x.InvoiceId == invoiceId);
        invoice.CheckoutCycleId = sessionId;
        invoice.CheckoutRevision = 1;
        invoice.HoldExpiresAtUtc = expires;
        db.Set<CheckoutSession>().Add(new()
        {
            CheckoutSessionId = sessionId, InvoiceId = invoiceId, Revision = 1,
            IdempotencyKey = $"{Prefix}-{resourceId:N}", Kind = kind, State = "Active",
            CreatedAtUtc = Now, ExpiresAtUtc = expires, ResourceHoldId = resourceId, ClassId = classId
        });
    }

    private async Task<Room> RoomAsync(Sport sport, string purpose, bool rental, CancellationToken ct)
    {
        var name = $"{Prefix} {sport.Code} {purpose}";
        var room = await db.Rooms.SingleOrDefaultAsync(x => x.Name == name, ct);
        if (room is not null) return room;
        var type = await db.Set<SportRoomType>().Where(x => x.SportId == sport.SportId)
            .OrderBy(x => x.RoomTypeId).Select(x => (int?)x.RoomTypeId).FirstOrDefaultAsync(ct);
        room = new Room { Name = name, Capacity = 12, RoomTypeId = type, AllowRental = rental,
            RentalBookingOpensAtUtc = rental ? VietnamTime.StartOfDayUtc(Today.AddDays(-60)) : null };
        db.Rooms.Add(room);
        await db.SaveChangesAsync(ct);
        db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
        {
            RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0)
        }));
        if (rental && type.HasValue)
            db.Set<CourtRate>().Add(new() { RoomTypeId = type.Value, RoomId = room.RoomId,
                SportId = sport.SportId, DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN",
                StartTimeLocal = new(6, 0), EndTimeLocal = new(22, 0), PricePerHour = 100_000, IsActive = true });
        await db.SaveChangesAsync(ct);
        return room;
    }

    private async Task<DateTime> FreeSlotAsync(DateOnly day, Guid coachId, int roomId, int minutes, CancellationToken ct)
    {
        for (var hour = 6; hour + minutes / 60d <= 22; hour += 2)
        {
            var start = VietnamTime.StartOfDayUtc(day).AddHours(hour);
            var end = start.AddMinutes(minutes);
            if (await db.CoachOccupancies.AnyAsync(x => x.IsActive && x.CoachId == coachId && x.StartAtUtc < end && x.EndAtUtc > start, ct)
                || await db.RoomOccupancies.AnyAsync(x => x.IsActive && x.RoomId == roomId && x.StartAtUtc < end && x.EndAtUtc > start, ct)
                || await db.ClassSessions.AnyAsync(x => x.Status != ClassSessionStatus.Cancelled && x.StartAtUtc < end && x.EndAtUtc > start
                    && db.Enrollments.Any(e => e.ClassId == x.ClassId && e.Status == EnrollmentStatus.Confirmed && members.Select(m => m.UserId).Contains(e.MemberId)), ct)) continue;
            return start;
        }
        throw new InvalidOperationException($"No free scenario slot on {day}. All new system scenarios were rolled back.");
    }

    private async Task SeedClassesAsync(Sport sport, UserAccount[] coaches, CancellationToken ct)
    {
        var minutes = sport.Services.Single(x => x.ServiceType == SportServiceType.GroupCourse).DefaultSessionMinutes
            ?? throw new InvalidOperationException($"Configure the session duration for {sport.Code} first.");
        var states = new[] { ("DRAFT", ClassStatus.Draft), ("OPEN", ClassStatus.Published),
            ("ACTIVE", ClassStatus.InProgress), ("COMPLETED", ClassStatus.Completed),
            ("CANCELLED", ClassStatus.Cancelled), ("FULL", ClassStatus.Published), ("AT-RISK", ClassStatus.Published) };
        for (var index = 0; index < states.Length; index++)
        {
            var (key, status) = states[index];
            var code = $"{Prefix}-{sport.SportId}-{key}";
            if (await db.Classes.AnyAsync(x => x.Code == code, ct)) continue;
            var coach = coaches[0];
            var room = await RoomAsync(sport, key, false, ct);
            var startDay = status == ClassStatus.Completed ? Today.AddDays(-30)
                : status == ClassStatus.InProgress ? Today.AddDays(-4) : Today.AddDays(10 + index * 8);
            var course = new Class
            {
                Code = code, Name = $"{Prefix} {sport.Name} - {key}", SportId = sport.SportId,
                CoachId = coach.UserId, DefaultRoomId = room.RoomId, Capacity = key == "FULL" ? 3 : 12,
                NumSessions = 6, SessionMinutes = minutes, StartDate = startDay, Price = 900_000,
                CostAmount = 2_700_000, BreakEvenThreshold = 3, Status = status,
                ThresholdStatus = key == "AT-RISK" ? ThresholdStatus.AtRisk : ThresholdStatus.WaivedByManager,
                ThresholdDeadlineUtc = VietnamTime.StartOfDayUtc(startDay).AddDays(-3),
                EnrollmentOpen = status == ClassStatus.Published, CreatedAt = Now.AddDays(-40),
                PublishedAt = status == ClassStatus.Draft ? null : Now.AddDays(-35), Version = 1
            };
            db.Classes.Add(course);
            await db.SaveChangesAsync(ct);
            if (status == ClassStatus.Draft) continue;
            var sessions = new List<ClassSession>();
            for (var n = 0; n < 6; n++)
            {
                var teacher = status == ClassStatus.InProgress && n == 4 && coaches.Length > 1 ? coaches[1] : coach;
                var start = await FreeSlotAsync(startDay.AddDays(n * 2), teacher.UserId, room.RoomId, minutes, ct);
                var session = new ClassSession
                {
                    SessionId = Guid.NewGuid(), ClassId = course.ClassId, SessionNo = n + 1,
                    RoomId = room.RoomId, CoachId = teacher.UserId, StartAtUtc = start, EndAtUtc = start.AddMinutes(minutes),
                    Status = status == ClassStatus.Cancelled ? ClassSessionStatus.Cancelled
                        : start.AddMinutes(minutes) <= Now ? ClassSessionStatus.Completed : ClassSessionStatus.Scheduled
                };
                db.ClassSessions.Add(session);
                sessions.Add(session);
                var active = session.Status != ClassSessionStatus.Cancelled;
                db.RoomOccupancies.Add(new() { OccupancyId = Guid.NewGuid(), RoomId = room.RoomId,
                    SourceType = OccupancySourceType.ClassSession, SourceId = session.SessionId,
                    StartAtUtc = start, EndAtUtc = session.EndAtUtc, IsActive = active });
                db.CoachOccupancies.Add(new() { OccupancyId = Guid.NewGuid(), CoachId = teacher.UserId,
                    SourceType = OccupancySourceType.ClassSession, SourceId = session.SessionId,
                    StartAtUtc = start, EndAtUtc = session.EndAtUtc, IsActive = active });
                await db.SaveChangesAsync(ct);
            }
            if (status != ClassStatus.Cancelled)
            {
                var count = key == "AT-RISK" ? 1 : 3;
                for (var m = 0; m < count; m++)
                {
                    var member = members[m];
                    var item = await InvoiceAsync($"C{sport.SportId}{index}{m}", member.UserId, course.Price,
                        InvoiceItemType.ClassPackage, null, sessions[0].StartAtUtc.AddDays(-5), true, ct,
                        classId: course.ClassId, sportId: sport.SportId);
                    var enrollment = new Enrollment { EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId,
                        MemberId = member.UserId, InvoiceItemId = item.ItemId, Status = EnrollmentStatus.Confirmed,
                        EnrolledAt = item.Invoice!.PaidAtUtc!.Value };
                    db.Enrollments.Add(enrollment);
                    course.ConfirmedCount++;
                    course.ReservedCount++;
                    foreach (var session in sessions.Where(x => x.EndAtUtc <= Now))
                    {
                        if (m == 2 && session.SessionNo == 2) continue; // Not marked, not silently absent.
                        var absent = m == 1 && session.SessionNo == 1;
                        db.Attendances.Add(new() { AttendanceId = Guid.NewGuid(), EnrollmentId = enrollment.EnrollmentId,
                            SessionId = session.SessionId, Status = absent ? AttendanceStatus.Absent : AttendanceStatus.Present,
                            RecordedByUserId = session.CoachId, RecordedAt = session.StartAtUtc.AddMinutes(5) });
                        if (!absent) Teaching(course, session, member.UserId, "RESULT", "Session assessment",
                            "Footwork and control improved. Focus on accuracy before increasing speed.", session.EndAtUtc, 4);
                    }
                }
                if (status == ClassStatus.Published && key == "OPEN")
                {
                    var holdId = Guid.NewGuid();
                    var item = await InvoiceAsync($"H{sport.SportId}", members[3 % members.Length].UserId, course.Price,
                        InvoiceItemType.ClassPackage, holdId, Now, false, ct, classId: course.ClassId, sportId: sport.SportId);
                    db.Set<SeatHold>().Add(new() { HoldId = holdId, ClassId = course.ClassId,
                        MemberId = members[3 % members.Length].UserId, InvoiceId = item.InvoiceId,
                        Status = SeatHoldStatus.Active, CreatedAt = Now, ExpiresAtUtc = Now.AddMinutes(15) });
                    course.ReservedCount++;
                    AddCheckout(item.InvoiceId, "Class", holdId, Now.AddMinutes(15), course.ClassId);
                }
                Teaching(course, null, null, "PLAN", "Course plan",
                    "Build technique, coordination and match awareness across six sessions.", Now.AddDays(-5));
                foreach (var session in sessions)
                    Teaching(course, session, null, "PLAN", $"Session {session.SessionNo} plan",
                        "Warm-up: 10 minutes. Footwork: 3 sets x 12 reps. Technique drills: 3 sets x 10 reps. Cool-down: 5 minutes.",
                        session.StartAtUtc < Now ? session.StartAtUtc.AddHours(-2) : Now);
                var past = sessions.LastOrDefault(x => x.EndAtUtc <= Now);
                if (past is not null)
                    Teaching(course, past, null, "HOMEWORK", "Practice before the next lesson",
                        "Optional: footwork practice, 3 sets x 12 reps. Discuss difficulties at the next lesson.", past.EndAtUtc);
                if (status == ClassStatus.InProgress)
                {
                    var next = sessions.First(x => x.StartAtUtc > Now.AddHours(6));
                    db.Set<ClassSessionChangeRequest>().Add(new()
                    {
                        RequestId = Guid.NewGuid(), SessionId = next.SessionId, RequestedByUserId = next.CoachId,
                        Type = "ABSENCE", Reason = "Local scenario: an unexpected personal appointment.",
                        Status = "PENDING", CreatedAtUtc = Now, OriginalStartAtUtc = next.StartAtUtc,
                        OriginalEndAtUtc = next.EndAtUtc, OriginalRoomId = room.RoomId
                    });
                }
            }
            await db.SaveChangesAsync(ct);
        }
    }

    private void Teaching(Class course, ClassSession? session, Guid? member, string kind,
        string title, string content, DateTime at, int? score = null) => db.Set<ClassTeachingRecord>().Add(new()
    {
        RecordId = Guid.NewGuid(), ClassId = course.ClassId, SessionId = session?.SessionId,
        CoachId = session?.CoachId ?? course.CoachId!.Value, MemberId = member, Kind = kind,
        Title = title, Content = content, Score = score, CreatedAtUtc = at, UpdatedAtUtc = at, Version = 1
    });

    private async Task SeedRentalsAsync(Sport sport, CancellationToken ct)
    {
        var room = await RoomAsync(sport, "Rental", true, ct);
        var states = new[] { CourtRentalStatus.Completed, CourtRentalStatus.Confirmed, CourtRentalStatus.PendingPayment,
            CourtRentalStatus.Cancelled, CourtRentalStatus.NoShow, CourtRentalStatus.InUse };
        for (var i = 0; i < states.Length; i++)
        {
            var marker = $"{Prefix}-R{sport.SportId}{i}";
            if (await db.Invoices.AnyAsync(x => x.InvoiceNumber == marker, ct)) continue;
            var status = states[i];
            var offset = status is CourtRentalStatus.Completed or CourtRentalStatus.NoShow ? -3 - i
                : status == CourtRentalStatus.InUse ? 0 : 2 + i;
            var start = VietnamTime.StartOfDayUtc(Today.AddDays(offset)).AddHours(8 + i * 2);
            if (status == CourtRentalStatus.InUse) start = Now.AddMinutes(-30);
            var duration = i % 2 == 0 ? 2 : 1;
            var price = 100_000m * duration;
            var member = members[(i + 3) % members.Length];
            var id = Guid.NewGuid();
            var paid = status != CourtRentalStatus.PendingPayment && status != CourtRentalStatus.Cancelled;
            var item = await InvoiceAsync($"R{sport.SportId}{i}", member.UserId, price, InvoiceItemType.Rental,
                id, Now.AddDays(-8), paid, ct, sportId: sport.SportId, rentalId: null);
            var rental = new CourtRental
            {
                CourtRentalId = id, MemberId = member.UserId, SportId = sport.SportId, RoomId = room.RoomId,
                StartAtUtc = start, EndAtUtc = start.AddHours(duration), TotalPrice = price,
                Status = status, CreatedAtUtc = Now.AddDays(-8), InvoiceId = item.InvoiceId, InvoiceItemId = item.ItemId,
                PriceSnapshotJson = JsonSerializer.Serialize(new[] { new { startAtUtc = start, endAtUtc = start.AddHours(duration), pricePerHour = 100_000, amount = price } }),
                CancelledAtUtc = status == CourtRentalStatus.Cancelled ? Now.AddDays(-1) : null,
                CancelReason = status == CourtRentalStatus.Cancelled ? "Local scenario: unpaid reservation cancelled." : null
            };
            db.Set<CourtRental>().Add(rental);
            await db.SaveChangesAsync(ct);
            item.CourtRentalId = id;
            if (status == CourtRentalStatus.Cancelled) item.Invoice!.Status = InvoiceStatus.Void;
            if (status != CourtRentalStatus.Cancelled && status != CourtRentalStatus.NoShow)
                db.RoomOccupancies.Add(new() { OccupancyId = Guid.NewGuid(), RoomId = room.RoomId,
                    SourceType = OccupancySourceType.CourtRental, SourceId = id,
                    StartAtUtc = start, EndAtUtc = rental.EndAtUtc, IsActive = true });
            if (status == CourtRentalStatus.PendingPayment)
            {
                rental.CreatedAtUtc = Now;
                AddCheckout(item.InvoiceId, "CourtRental", id, Now.AddMinutes(15));
            }
            await db.SaveChangesAsync(ct);
        }
    }
}
