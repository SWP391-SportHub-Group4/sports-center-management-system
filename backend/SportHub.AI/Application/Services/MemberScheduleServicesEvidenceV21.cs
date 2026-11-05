using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member-only evidence for Schedule, Services and class teaching plans. No LLM database access,
/// no writes and no membership/Coach/Plan side effects. The caller MUST verify Member role.
/// </summary>
internal static class MemberScheduleServicesEvidenceV21
{
    internal enum Topic { None, MySchedule, MyClasses, ClassPlans, MyServices, ExplorePackages, CourtAvailability }

    private static string Normalize(string input)
    {
        var value = (input ?? string.Empty).Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(value.Length);
        foreach (var c in value)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
    private static bool Has(string q, params string[] words) => words.Any(w => q.Contains(w, StringComparison.Ordinal));

    internal static Topic Classify(string question)
    {
        var q = Normalize(question);
        if (Has(q, "gio trong", "gio con trong", "slot", "available court", "san con trong", "gia thue san", "court availability", "room 101", "room 102", "pickle ball", "pickleball"))
            return Topic.CourtAvailability;
        if (Has(q, "session plan", "personal plan", "giao an", "noi dung buoi", "bai hoc", "buoi so", "ke hoach buoi", "khoa hoc cua toi", "coach day gi", "noi dung plan", "plan cua lop"))
            return Topic.ClassPlans;
        if (Has(q, "my schedule", "lich hoc", "lich tap", "lich cua toi", "buoi tiep theo", "lich thue san", "lich thang"))
            return Topic.MySchedule;
        if (Has(q, "lop toi", "lop cua toi", "lop nao toi", "lop dang hoc", "lop da dang ky", "lop da ghi danh", "tham gia lop", "dang hoc lop", "my classes", "my enrolled"))
            return Topic.MyClasses;
        if (Has(q, "my services", "dich vu cua toi", "goi toi da mua", "goi dang dung", "goi dang co", "gym con bao lau", "con bao nhieu ngay"))
            return Topic.MyServices;
        if (Has(q, "explore packages", "goi nao", "gia goi gym", "gym 3 months", "gym 6 months", "gym 12 months", "day pass", "gia lop", "lop nao dang mo", "dang ky lop", "dich vu dang ban", "cac goi gym"))
            return Topic.ExplorePackages;
        return Topic.None;
    }

    internal static async Task<object> LoadAsync(ISportHubDbContext db, Guid memberId, Topic topic,
        DateTime nowUtc, CancellationToken ct)
    {
        // Never interpret names or IDs from the prompt as authority; only authenticated memberId.
        var active = db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
                && (e.Class!.Status == ClassStatus.Published || e.Class.Status == ClassStatus.InProgress
                    || e.Class.Status == ClassStatus.Completed));
        var myClassIds = active.Select(e => e.ClassId);

        if (topic is Topic.MyClasses or Topic.MySchedule or Topic.ClassPlans)
        {
            var enrollments = await active.OrderByDescending(e => e.EnrolledAt).Take(60)
                .Select(e => new { e.ClassId, e.EnrolledAt, enrollmentStatus = e.Status.ToString(),
                    name = e.Class != null ? e.Class.Name : null,
                    code = e.Class != null ? e.Class.Code : null,
                    classStatus = e.Class != null ? e.Class.Status.ToString() : null,
                    coachId = e.Class != null ? e.Class.CoachId : null,
                    startDate = e.Class != null ? (DateOnly?)e.Class.StartDate : null,
                    sessions = e.Class != null ? (int?)e.Class.NumSessions : null,
                    sport = e.Class != null && e.Class.Sport != null ? e.Class.Sport.Name : null })
                .ToListAsync(ct);
            var coachIds = enrollments.Where(e => e.coachId.HasValue).Select(e => e.coachId!.Value).Distinct().ToList();
            var coaches = await db.Set<UserAccount>().AsNoTracking()
                .Where(u => coachIds.Contains(u.UserId))
                .Select(u => new { u.UserId, name = u.Profile != null ? u.Profile.FullName : null })
                .ToListAsync(ct);
            var coachNames = coaches.ToDictionary(c => c.UserId, c => c.name);
            var owned = enrollments.Select(e => new { e.ClassId, e.name, e.code, e.sport,
                e.enrollmentStatus, e.classStatus, e.startDate, e.sessions, e.EnrolledAt,
                coach = e.coachId is Guid id && coachNames.TryGetValue(id, out var name) ? name : null }).ToList();

            if (topic == Topic.MyClasses)
                return new { enrolledClasses = owned, count = await active.CountAsync(ct),
                    note = "Only the authenticated member's confirmed active enrollments. Never substitute public classes." };

            var nowStart = nowUtc.AddDays(-31);
            var futureEnd = nowUtc.AddDays(120);
            var sessions = await db.Set<ClassSession>().AsNoTracking()
                .Where(s => myClassIds.Contains(s.ClassId) && s.StartAtUtc >= nowStart && s.StartAtUtc < futureEnd)
                .OrderBy(s => s.StartAtUtc).Take(120)
                .Select(s => new { s.SessionId, s.ClassId, s.SessionNo, s.StartAtUtc, s.EndAtUtc,
                    status = s.Status.ToString(), room = s.Room != null ? s.Room.Name : null,
                    className = s.Class != null ? s.Class.Name : null }).ToListAsync(ct);
            var myRentals = await db.Set<CourtRental>().AsNoTracking()
                .Where(r => r.MemberId == memberId && r.StartAtUtc >= nowStart && r.StartAtUtc < futureEnd)
                .OrderBy(r => r.StartAtUtc).Take(60)
                .Select(r => new { r.CourtRentalId, r.RoomId, r.SportId, r.StartAtUtc, r.EndAtUtc,
                    status = r.Status.ToString(), r.TotalPrice }).ToListAsync(ct);
            if (topic == Topic.MySchedule)
                return new { enrolledClasses = owned, sessions, courtBookings = myRentals,
                    timeZone = "Asia/Ho_Chi_Minh", periodUtc = new { start = nowStart, end = futureEnd },
                    note = "Session dates are UTC; convert to Vietnam time. Status of the class and status of a session are different. Booking history is not public court availability." };

            var records = await db.Set<ClassTeachingRecord>().AsNoTracking()
                .Where(r => myClassIds.Contains(r.ClassId) && (r.MemberId == null || r.MemberId == memberId))
                .OrderByDescending(r => r.UpdatedAtUtc).Take(80)
                .Select(r => new { r.ClassId, r.SessionId, r.MemberId, r.Kind, r.Title, r.Content,
                    r.DueAtUtc, r.UpdatedAtUtc }).ToListAsync(ct);
            return new { enrolledClasses = owned, sessions, teachingRecords = records.Select(r => new {
                    r.ClassId, r.SessionId, personalized = r.MemberId != null, r.Kind, r.Title,
                    content = r.Content.Length <= 2500 ? r.Content : r.Content.Substring(0, 2500),
                    contentTruncated = r.Content.Length > 2500, r.DueAtUtc, r.UpdatedAtUtc }),
                recordsTruncated = records.Count == 80,
                note = "Teaching records visible only for the member's current confirmed enrollments and either shared class records or personal records addressed to this member. Never invent unprovided session content." };
        }

        if (topic == Topic.MyServices)
        {
            var memberships = await db.Set<MemberPackage>().AsNoTracking()
                .Where(p => p.MemberId == memberId).OrderByDescending(p => p.EndDate).Take(50)
                .Select(p => new { name = p.Package != null ? p.Package.Name : null,
                    p.Status, p.StartDate, p.EndDate, p.ExpiresAtUtc, p.RemainingSessions,
                    durationDays = p.Package != null ? (int?)p.Package.DurationDays : null }).ToListAsync(ct);
            var classes = await active.OrderByDescending(e => e.EnrolledAt).Take(50)
                .Select(e => new { name = e.Class != null ? e.Class.Name : null,
                    sessions = e.Class != null ? (int?)e.Class.NumSessions : null,
                    e.Status, start = e.Class != null ? (DateOnly?)e.Class.StartDate : null }).ToListAsync(ct);
            var courts = await db.Set<CourtRental>().AsNoTracking().Where(r => r.MemberId == memberId)
                .OrderByDescending(r => r.StartAtUtc).Take(40)
                .Select(r => new { r.StartAtUtc, r.EndAtUtc, r.TotalPrice, r.Status }).ToListAsync(ct);
            return new { memberships, enrolledClasses = classes, courtRentals = courts,
                note = "Member-owned services only. An Active membership record may be expired by date. Gym, classes and courts are separate products." };
        }

        if (topic == Topic.ExplorePackages)
        {
            var gym = await db.Set<MembershipPackage>().AsNoTracking().Where(p => p.IsActive)
                .OrderBy(p => p.Price).Take(40)
                .Select(p => new { p.Name, p.Price, p.OriginalPrice, p.DurationDays, p.Description, p.SessionLimit })
                .ToListAsync(ct);
            var classes = await db.Set<SportHub.Scheduling.Domain.Entities.Class>().AsNoTracking()
                .Where(c => c.EnrollmentOpen && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)).OrderBy(c => c.StartDate).Take(70)
                .Select(c => new { c.ClassId, c.Code, c.Name, c.Price, c.StartDate,
                    c.NumSessions, c.Capacity, c.ReservedCount, c.ConfirmedCount,
                    status = c.Status.ToString(), sport = c.Sport != null ? c.Sport.Name : null,
                    coachId = c.CoachId }).ToListAsync(ct);
            var ownedClassIds = await active.Select(e => e.ClassId).ToListAsync(ct);
            return new { gymPackages = gym, classCatalog = classes.Select(c => new {
                    c.Code, c.Name, c.Price, c.StartDate, c.NumSessions, c.Capacity,
                    availableSeats = Math.Max(0, c.Capacity - c.ReservedCount), c.ConfirmedCount,
                    c.status, c.sport, alreadyEnrolled = ownedClassIds.Contains(c.ClassId) }),
                notes = new[] { "Catalog shows products available for purchase, not necessarily services owned by this Member.",
                    "Renew vs choose plan depends on ownership and checkout eligibility. No purchase is performed by AI.",
                    "Court rental pricing is room/slot/date dependent; never use class or package price as court price." } };
        }

        // Court availability must come from the canonical member rental calendar & price quote API.
        // This tool intentionally does NOT guess from CourtRate, because occupancy, holds, class sessions,
        // operating hours, individual room rates and member timetable conflicts affect the final result.
        var sports = await db.Set<Sport>().AsNoTracking().Where(s => s.IsActive)
            .OrderBy(s => s.SortOrder).Take(30)
            .Select(s => new { s.SportId, s.Name }).ToListAsync(ct);
        var rooms = await db.Set<Room>().AsNoTracking().Where(r => r.IsActive && r.AllowRental)
            .OrderBy(r => r.Name).Take(60)
            .Select(r => new { r.RoomId, r.Name, r.SportId }).ToListAsync(ct);
        return new { sports, rentableRooms = rooms,
            bookingRuleFromUi = "Select a sport and date, then select 1–4 consecutive hours and a court. Only dates allowed by live booking policy are selectable.",
            canonicalApi = "GET /api/court-rentals/calendar?sportId={sportId}&date={yyyy-MM-dd}&hours=1",
            exactPriceApi = "GET /api/court-rentals/availability?sportId={sportId}&startUtc={utc}&endUtc={utc}",
            note = "This evidence does NOT contain live available/booked/on-hold slots or slot prices. Never invent or infer them. Use the booking calendar for live status, the availability/quote endpoint for the exact price. Price differs per room and time slot." };
    }
}
