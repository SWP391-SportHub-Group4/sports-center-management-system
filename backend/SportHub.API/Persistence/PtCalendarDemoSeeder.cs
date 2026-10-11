using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.API.Persistence;

public sealed partial class DemoDataSeeder
{
    /// <summary>Local fixtures for PT calendar. Invoice descriptions make each monthly seed idempotent.</summary>
    public async Task SeedPtCalendarAsync(CancellationToken ct = default)
    {
        var today = VietnamTime.TodayLocal(clock);
        var first = new DateOnly(today.Year, today.Month, 1);
        var last = first.AddMonths(1).AddDays(-1);
        var now = clock.UtcNow;
        var prefix = $"DEMO-PTCAL-{today:yyyyMM}";
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 1)", ct);
        var coach = await db.UserAccounts.Include(x => x.Role).SingleAsync(x => x.Email == "coach.pt@sporthub.vn", ct);
        var manager = await db.UserAccounts.Include(x => x.Role).SingleAsync(x => x.Email == "manager@sporthub.vn", ct);
        if (coach.Status != UserStatus.Active || coach.Role?.RoleName != UserRole.Coach
            || manager.Status != UserStatus.Active || manager.Role?.RoleName != UserRole.CenterManager)
            throw new InvalidOperationException("Active demo Coach PT and Manager accounts are required.");
        if (!await db.CoachServiceQualifications.AnyAsync(q => q.UserId == coach.UserId
            && db.Set<SportServiceOffering>().Any(o => o.OfferingId == q.OfferingId && o.ServiceType == SportServiceType.PersonalTraining), ct))
            throw new InvalidOperationException("Demo Coach must already be qualified for PT.");
        var roomTypeId = await db.Set<ServiceRoomType>()
            .Where(r => db.Set<SportServiceOffering>().Any(o => o.OfferingId == r.OfferingId && o.ServiceType == SportServiceType.PersonalTraining))
            .Select(r => (int?)r.RoomTypeId).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("A PT-compatible room type is required.");
        var room = await EnsureDemoRoomAsync("Demo PT · Studio huấn luyện cá nhân", roomTypeId, 2, ct)
            ?? throw new InvalidOperationException("Demo PT studio is not available.");
        var packageName = $"Demo Gym · Lịch PT {today:MM/yyyy}";
        var package = await db.MembershipPackages.SingleOrDefaultAsync(p => p.Name == packageName, ct);
        if (package is null)
        {
            package = new MembershipPackage { Name = packageName, Price = 600_000m,
                DurationDays = last.DayNumber - first.DayNumber + 1, IsActive = false,
                Description = "Local calendar fixture. Not offered for purchase." };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync(ct);
        }
        var emails = new[] { "an.member@sporthub.vn", "binh.member@sporthub.vn", "chi.member@sporthub.vn" };
        var goals = new[] { "Cải thiện sức bền và kiểm soát tư thế", "Xây dựng nền tảng sức mạnh", "Tăng khả năng vận động và giảm căng cơ" };
        var count = 0;
        for (var index = 0; index < emails.Length; index++)
        {
            var email = emails[index];
            var member = await db.UserAccounts.Include(x => x.Role).SingleAsync(x => x.Email == email, ct);
            if (member.Status != UserStatus.Active || member.Role?.RoleName != UserRole.Member)
                throw new InvalidOperationException($"Active demo Member {email} is required.");
            var membership = await db.MemberPackages.SingleOrDefaultAsync(p => p.MemberId == member.UserId && p.PackageId == package.PackageId, ct);
            if (membership is null)
            {
                var id = Guid.NewGuid();
                var invoice = await AddCalendarDemoInvoiceAsync(member.UserId, manager.UserId, package.Price,
                    InvoiceItemType.Membership, id, $"{prefix}-GYM-{email}", VietnamTime.StartOfDayUtc(first), ct);
                membership = new MemberPackage { MemberPackageId = id, MemberId = member.UserId, PackageId = package.PackageId,
                    InvoiceItemId = invoice.ItemId, StartDate = first, EndDate = last, DurationDaysSnapshot = package.DurationDays,
                    Status = MemberPackageStatus.Active, Version = 1 };
                db.MemberPackages.Add(membership);
                await db.SaveChangesAsync(ct);
            }
            var relationship = await db.CoachMemberRelationships.SingleOrDefaultAsync(r => r.CoachId == coach.UserId
                && r.MemberId == member.UserId && r.Status == RelationshipStatus.Active, ct);
            if (relationship is null)
            {
                relationship = new CoachMemberRelationship { RelationshipId = Guid.NewGuid(), CoachId = coach.UserId,
                    MemberId = member.UserId, SourceType = RelationshipSourceType.Personal, Status = RelationshipStatus.Active,
                    StartedAt = VietnamTime.StartOfDayUtc(first) };
                db.CoachMemberRelationships.Add(relationship);
            }
            if (!await db.MemberTrainingProfiles.AnyAsync(p => p.MemberId == member.UserId, ct))
                db.MemberTrainingProfiles.Add(new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = member.UserId,
                    Goal = goals[index], ExperienceLevel = ExperienceLevel.Beginner, Notes = "Hồ sơ demo PT", UpdatedAt = now });
            await db.SaveChangesAsync(ct);
            var planGoal = $"{goals[index]} · Demo {today:MM/yyyy}";
            if (!await db.WorkoutPlans.AnyAsync(p => p.CoachId == coach.UserId && p.MemberId == member.UserId && p.Goal == planGoal, ct))
            {
                var plan = new WorkoutPlan { PlanId = Guid.NewGuid(), MemberId = member.UserId, CoachId = coach.UserId,
                    RelationshipId = relationship.RelationshipId, Goal = planGoal, Level = "Beginner", Status = WorkoutPlanStatus.Active,
                    CreatedAt = now, UpdatedAt = now, Version = 1 };
                db.WorkoutPlans.Add(plan);
                db.WorkoutPlanItems.AddRange(new[] { "Goblet squat", "Seated row", "Dead bug", "Giãn cơ sau tập" }.Select((exercise, i) =>
                    new WorkoutPlanItem { ItemId = Guid.NewGuid(), PlanId = plan.PlanId, Exercise = exercise, Sets = i == 3 ? 1 : 3,
                        Reps = i == 3 ? 5 : 12, Notes = i == 3 ? "Thả lỏng, hít thở đều" : "Kiểm soát tư thế, nghỉ 60 giây giữa hiệp" }));
                await db.SaveChangesAsync(ct);
            }
            foreach (var offset in new[] { -6, -3, 0, 2, 4, 7 })
            {
                var day = today.AddDays(offset);
                if (day < first || day > last) continue;
                var description = $"{prefix}-SESSION-{email}-{offset}";
                if (await db.InvoiceItems.AnyAsync(item => item.Description == description, ct)) continue;
                (DateTime start, DateTime end)? slot = null;
                foreach (var hour in new[] { 8 + index * 3, 8, 10, 12, 14, 16, 18, 20 }.Distinct())
                {
                    var candidate = await FindTeachingDemoSlotAsync(day, hour, coach.UserId, room.RoomId, [member.UserId], ct);
                    if (await db.PtSessions.AnyAsync(s => s.CoachId == coach.UserId && s.StartAtUtc < candidate.end && s.EndAtUtc > candidate.start
                        && (s.Status == PtSessionStatus.Scheduled || s.Status == PtSessionStatus.Completed || s.Status == PtSessionStatus.NoShow || s.Status == PtSessionStatus.PendingPayment), ct)) continue;
                    slot = candidate;
                    break;
                }
                if (slot is null) throw new InvalidOperationException($"No free PT demo slot on {day}; nothing was committed.");
                var (start, end) = slot.Value;
                var state = end <= now ? offset == -3 && index == 1 ? PtSessionStatus.NoShow : PtSessionStatus.Completed : PtSessionStatus.Scheduled;
                if (offset == -3 && index == 2) state = PtSessionStatus.CancelledOnTime;
                var consumed = state is PtSessionStatus.Completed or PtSessionStatus.NoShow;
                var entitlementId = Guid.NewGuid();
                var paidAt = VietnamTime.StartOfDayUtc(first);
                var payment = await AddCalendarDemoInvoiceAsync(member.UserId, manager.UserId, 250_000m,
                    InvoiceItemType.PT, entitlementId, description, paidAt, ct);
                db.PtEntitlements.Add(new PtEntitlement { EntitlementId = entitlementId, ActivationReference = payment.ItemId,
                    MemberId = member.UserId, CoachId = coach.UserId, OriginMemberPackageId = membership.MemberPackageId,
                    CurrentMemberPackageId = membership.MemberPackageId, FrequencyPerWeek = 1, TotalQuota = 1,
                    ReservedSessions = state == PtSessionStatus.Scheduled ? 1 : 0, ConsumedSessions = consumed ? 1 : 0,
                    ValidityStartDate = first, ValidityEndDate = last, CarryOverUntilDate = last.AddDays(30),
                    Status = PtEntitlementStatus.Active, ActivatedAt = paidAt, Version = 1 });
                var session = new PtSession { SessionId = Guid.NewGuid(), EntitlementId = entitlementId,
                    MemberId = member.UserId, CoachId = coach.UserId, RoomId = room.RoomId, StartAtUtc = start, EndAtUtc = end,
                    CreatedByUserId = manager.UserId, Version = 1, Status = state,
                    QuotaState = consumed ? PtSessionQuotaState.Consumed : state == PtSessionStatus.Scheduled ? PtSessionQuotaState.Reserved : PtSessionQuotaState.Released,
                    CompletedAt = state == PtSessionStatus.Completed ? end : null,
                    CancelledAt = state == PtSessionStatus.CancelledOnTime ? start.AddDays(-1) : null,
                    CancellationReason = state == PtSessionStatus.CancelledOnTime ? "Demo · Học viên xin nghỉ trước buổi tập" : null };
                db.PtSessions.Add(session);
                db.CoachOccupancies.Add(new CoachOccupancy { OccupancyId = Guid.NewGuid(), CoachId = coach.UserId,
                    SourceType = OccupancySourceType.PtSession, SourceId = session.SessionId, StartAtUtc = start, EndAtUtc = end, IsActive = state == PtSessionStatus.Scheduled });
                db.RoomOccupancies.Add(new RoomOccupancy { OccupancyId = Guid.NewGuid(), RoomId = room.RoomId,
                    SourceType = OccupancySourceType.PtSession, SourceId = session.SessionId, StartAtUtc = start, EndAtUtc = end, IsActive = state == PtSessionStatus.Scheduled });
                if (state == PtSessionStatus.Completed)
                    db.WorkoutResults.Add(new WorkoutResult { ResultId = Guid.NewGuid(), PtSessionId = session.SessionId,
                        CoachId = coach.UserId, ProgressNote = "Hoàn thành 3 hiệp squat và row; kiểm soát tư thế tốt hơn buổi trước.",
                        CoachComment = "Tiếp tục giữ nhịp thở đều. Buổi sau tăng mức tạ theo khả năng.", RecordedAt = end.AddMinutes(5) });
                await db.SaveChangesAsync(ct);
                count++;
            }
        }
        await transaction.CommitAsync(ct);
        logger.LogInformation("PT calendar demo ready for coach.pt@sporthub.vn: {Count} new sessions, three students, plans and progress ({Month}).", count, prefix);
    }
}
