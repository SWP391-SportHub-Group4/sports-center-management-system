using NotificationEntity = SportHub.Notification.Domain.Entities.Notification;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Notification.Domain.Entities;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Wallet.Domain;
using SportHub.Training.Domain.Entities;

namespace SportHub.AI.Application.Services;

// MEMBER_DATAHUB_V12: per-request, read-only, bounded evidence; NEVER accepts an ID from chat text.
internal enum MemberEvidenceDomain
{
    Overview, Account, Fitness, Membership, Classes, Schedule, CourtBookings,
    Billing, Points, Support, Notifications, Training, Attendance, GymCheckIns, Catalog
}

internal static class MemberDataHub
{
    internal static async Task<object> LoadEvidenceAsync(
        ISportHubDbContext db, Guid memberId, MemberEvidenceDomain domain,
        DateTime nowUtc, CancellationToken ct)
    {
        switch (domain)
        {
            case MemberEvidenceDomain.Account:
            {
                var account = await db.Set<UserAccount>().AsNoTracking()
                    .Where(u => u.UserId == memberId)
                    .Select(u => new { u.Email,
                        fullName = u.Profile != null ? u.Profile.FullName : null,
                        phone = u.Profile != null ? u.Profile.Phone : null })
                    .SingleOrDefaultAsync(ct);
                return new { account, note = "Only the authenticated member's own profile. Never disclose credentials." };
            }
            case MemberEvidenceDomain.Fitness:
            {
                var p = await db.Set<MemberTrainingProfile>().AsNoTracking()
                    .Where(x => x.MemberId == memberId)
                    .Select(x => new { x.Goal, x.GoalType, x.ExperienceLevel, x.HeightCm,
                        x.WeightKg, x.ActivityLevel, x.TrainingDaysPerWeek,
                        x.SessionMinutes, x.BodyBuild, x.UpdatedAt })
                    .SingleOrDefaultAsync(ct);
                var history = await db.Set<MemberBodyMeasurement>().AsNoTracking()
                    .Where(x => x.MemberId == memberId)
                    .OrderByDescending(x => x.MeasuredAt).Take(20)
                    .Select(x => new { x.HeightCm, x.WeightKg, x.MeasuredAt }).ToListAsync(ct);
                decimal? bmi = p?.HeightCm is > 0 && p.WeightKg is > 0
                    ? Math.Round(p.WeightKg.Value / ((p.HeightCm.Value / 100m) * (p.HeightCm.Value / 100m)), 2)
                    : null;
                return new { profile = p, computedBmi = bmi, measurementHistory = history,
                    note = "Measurements are self-reported. BMI is a screening index, not a diagnosis. No medical notes, allergies or date of birth supplied." };
            }
            case MemberEvidenceDomain.Membership:
            {
                var q = db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var records = await q.OrderByDescending(x => x.EndDate).Take(30)
                    .Select(x => new { packageName = x.Package != null ? x.Package.Name : null,
                        x.Status, x.StartDate, x.EndDate, x.ExpiresAtUtc, x.RemainingSessions })
                    .ToListAsync(ct);
                return new { total, records, truncated = total > records.Count,
                    note = "Active status alone is not proof of validity. Check EndDate/ExpiresAtUtc against current date." };
            }
            case MemberEvidenceDomain.Classes:
            {
                var q = db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var enrolled = await q.OrderByDescending(e => e.EnrolledAt).Take(50)
                    .Select(e => new { e.Status, e.EnrolledAt, className = e.Class != null ? e.Class.Name : null,
                        classCode = e.Class != null ? e.Class.Code : null,
                        classStatus = e.Class != null ? (ClassStatus?)e.Class.Status : null,
                        sport = e.Class != null && e.Class.Sport != null ? e.Class.Sport.Name : null })
                    .ToListAsync(ct);
                return new { totalEnrollments = total, records = enrolled, truncated = total > enrolled.Count,
                    note = "Member's enrollments only; class status and enrollment status are distinct." };
            }
            case MemberEvidenceDomain.Schedule:
            {
                var enrolledClassIds = db.Set<Enrollment>().AsNoTracking()
                    .Where(e => e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed)
                    .Select(e => e.ClassId);
                var q = db.Set<ClassSession>().AsNoTracking()
                    .Where(s => enrolledClassIds.Contains(s.ClassId) &&
                        s.StartAtUtc >= nowUtc.AddDays(-30) && s.StartAtUtc <= nowUtc.AddDays(90));
                var total = await q.CountAsync(ct);
                var sessions = await q.OrderBy(s => s.StartAtUtc).Take(75)
                    .Select(s => new { className = s.Class != null ? s.Class.Name : null,
                        s.SessionNo, s.StartAtUtc, s.EndAtUtc, s.Status,
                        roomName = s.Room != null ? s.Room.Name : null })
                    .ToListAsync(ct);
                return new { totalInWindow = total, sessions, truncated = total > sessions.Count,
                    windowStartUtc = nowUtc.AddDays(-30), windowEndUtc = nowUtc.AddDays(90),
                    note = "Class sessions from confirmed enrollments only. Court rental schedule is a separate domain." };
            }
            case MemberEvidenceDomain.CourtBookings:
            {
                var q = db.Set<CourtRental>().AsNoTracking().Where(x => x.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var bookings = await q.OrderByDescending(x => x.StartAtUtc).Take(50)
                    .Select(x => new { x.StartAtUtc, x.EndAtUtc, x.Status, x.TotalPrice,
                        x.SportId, x.RoomId }).ToListAsync(ct);
                return new { total, bookings, truncated = total > bookings.Count,
                    note = "Only bookings owned by this Member. RoomId and SportId are not names; do not invent names." };
            }
            case MemberEvidenceDomain.Billing:
            {
                var q = db.Set<Invoice>().AsNoTracking().Where(x => x.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var invoices = await q.OrderByDescending(x => x.IssuedAt).Take(40)
                    .Select(x => new { x.InvoiceNumber, x.TotalAmount, x.CashAmount,
                        x.PointsApplied, x.Status, x.IssuedAt, x.PaidAtUtc })
                    .ToListAsync(ct);
                return new { total, invoices, truncated = total > invoices.Count,
                    note = "Invoice totals, not an independently verified bank or gateway settlement statement." };
            }
            case MemberEvidenceDomain.Points:
            {
                var wallet = await db.Set<PointWallet>().AsNoTracking()
                    .Where(x => x.OwnerUserId == memberId)
                    .Select(x => new { x.AvailablePoints, x.HeldPoints })
                    .SingleOrDefaultAsync(ct);
                return new { wallet, note = "AvailablePoints and HeldPoints are distinct. No fabricated transactions." };
            }
            case MemberEvidenceDomain.Support:
            {
                var q = db.Set<MemberSupportRequest>().AsNoTracking().Where(x => x.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var requests = await q.OrderByDescending(x => x.CreatedAt).Take(40)
                    .Select(x => new { x.Subject, x.Category, x.Status, x.CreatedAt,
                        x.SlaDueAtUtc, x.UpdatedAt, x.ClosedAt, x.ProgressNote })
                    .ToListAsync(ct);
                return new { total, requests, truncated = total > requests.Count,
                    note = "Only this Member's own support requests. SLA fields are not proof of promised resolution." };
            }
            case MemberEvidenceDomain.Notifications:
            {
                var q = db.Set<NotificationEntity>().AsNoTracking()
                    .Where(x => x.UserId == memberId && x.Channel == NotificationChannel.InApp);
                var total = await q.CountAsync(ct);
                var unread = await q.CountAsync(x => x.Status != NotificationStatus.Read, ct);
                var messages = await q.OrderByDescending(x => x.SentAt).Take(40)
                    .Select(x => new { x.Message, x.Status, x.SourceEventType, x.SentAt })
                    .ToListAsync(ct);
                return new { total, unread, records = messages, truncated = total > messages.Count,
                    note = "In-app notifications for this Member. Latest does not necessarily mean most urgent." };
            }
            case MemberEvidenceDomain.Attendance:
            {
                var ownEnrollments = db.Set<Enrollment>().AsNoTracking()
                    .Where(e => e.MemberId == memberId).Select(e => e.EnrollmentId);
                var q = db.Set<Attendance>().AsNoTracking()
                    .Where(a => ownEnrollments.Contains(a.EnrollmentId));
                var total = await q.CountAsync(ct);
                var records = await q.OrderByDescending(a => a.RecordedAt).Take(60)
                    .Select(a => new { a.Status, a.RecordedAt,
                        className = a.Session != null && a.Session.Class != null ? a.Session.Class.Name : null,
                        sessionDateUtc = a.Session != null ? (DateTime?)a.Session.StartAtUtc : null })
                    .ToListAsync(ct);
                return new { total, records, truncated = total > records.Count,
                    note = "Own course attendance recorded by Receptionist. Gym check-ins are separate." };
            }
            case MemberEvidenceDomain.GymCheckIns:
            {
                var q = db.Set<GymCheckIn>().AsNoTracking().Where(x => x.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var recent = await q.OrderByDescending(x => x.CheckInTime).Take(50)
                    .Select(x => new { x.CheckInTime }).ToListAsync(ct);
                return new { total, records = recent, truncated = total > recent.Count,
                    note = "Gym check-ins are not course attendance and do not decrement membership sessions." };
            }
            case MemberEvidenceDomain.Catalog:
            {
                var packages = await db.Set<MembershipPackage>().AsNoTracking()
                    .Where(x => x.IsActive).OrderBy(x => x.Name).Take(40)
                    .Select(x => new { x.Name, x.Price, x.DurationDays, x.SessionLimit, x.Description })
                    .ToListAsync(ct);
                var classes = await db.Set<Class>().AsNoTracking()
                    .Where(x => x.EnrollmentOpen && (x.Status == ClassStatus.Published ||
                        x.Status == ClassStatus.InProgress))
                    .OrderBy(x => x.StartDate).Take(40)
                    .Select(x => new { x.Name, x.Code, x.Capacity, x.ReservedCount,
                        x.Price, x.StartDate, sport = x.Sport != null ? x.Sport.Name : null })
                    .ToListAsync(ct);
                return new { availablePackages = packages, openClasses = classes,
                    note = "Bounded current public offers. Class capacity can change at checkout; no reservation created." };
            }
            case MemberEvidenceDomain.Training:
            {
                var q = db.Set<WorkoutPlan>().AsNoTracking().Where(x => x.MemberId == memberId);
                var total = await q.CountAsync(ct);
                var plans = await q.OrderByDescending(x => x.UpdatedAt).Take(30)
                    .Select(x => new { x.Goal, x.Level, x.Status, x.CreatedAt, x.UpdatedAt,
                        exerciseCount = x.Items.Count })
                    .ToListAsync(ct);
                return new { total, plans, truncated = total > plans.Count,
                    note = "Coach-created workout plans. Do not call AI Plan generator or create new plans from chat." };
            }
            case MemberEvidenceDomain.Overview:
            default:
            {
                var enrolledClasses = await db.Set<Enrollment>().AsNoTracking()
                    .CountAsync(x => x.MemberId == memberId && x.Status == EnrollmentStatus.Confirmed, ct);
                var activeMembershipRecords = await db.Set<MemberPackage>().AsNoTracking()
                    .CountAsync(x => x.MemberId == memberId && x.Status == MemberPackageStatus.Active, ct);
                var upcomingCourtBookings = await db.Set<CourtRental>().AsNoTracking()
                    .CountAsync(x => x.MemberId == memberId && x.StartAtUtc > nowUtc &&
                        (x.Status == CourtRentalStatus.Confirmed || x.Status == CourtRentalStatus.InUse), ct);
                var unreadNotifications = await db.Set<NotificationEntity>().AsNoTracking()
                    .CountAsync(x => x.UserId == memberId && x.Channel == NotificationChannel.InApp &&
                        x.Status != NotificationStatus.Read, ct);
                var openRequests = await db.Set<MemberSupportRequest>().AsNoTracking()
                    .CountAsync(x => x.MemberId == memberId && x.ClosedAt == null, ct);
                return new { confirmedEnrollments = enrolledClasses,
                    activeMembershipStatusRecords = activeMembershipRecords,
                    upcomingConfirmedCourtBookings = upcomingCourtBookings,
                    unreadNotifications, unclosedSupportRequests = openRequests,
                    note = "Overview is a subset, not a complete all-time activity report. Membership validity needs time checks." };
            }
        }
    }
}
