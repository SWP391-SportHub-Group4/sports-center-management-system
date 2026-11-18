using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.AI.Application.Services.Flow6;

// Member policy is deliberately independent of Coach policy. Only this list may reach Member's gateway.
public static class MemberFlow6Chat
{
    private static readonly Flow6Policy Policy = new("Member",
        ["overview", "account", "fitness", "membership", "sports", "myClasses", "classSchedule",
         "classPlans", "myServices", "explorePackages", "courtRental", "myCourtBookings", "billing",
         "points", "support", "notifications", "training", "attendance", "gymCheckIns"],
        """
        Use explorePackages for class/package discovery, prices and recommendations, NOT myClasses alone.
        For class recommendations also choose myClasses (existing enrollment) and fitness only if personal fitness/experience is relevant; classSchedule if schedule conflicts are requested.
        For owned class/enrollment status choose myClasses; for dates/sessions choose classSchedule; for attendance choose attendance.
        For owned products choose myServices or membership, not explorePackages.
        For live court slots/quotes choose courtRental and acknowledge that the live quote is unavailable from chat.
        For saved workout plans/AI suggestion records choose training, for teaching records choose classPlans.
        For account and payment data use only this Member's own records; other members or classmates, rosters, contacts or private records are PRIVACY_DENIED.
        Questions about public catalog capacity/price are not requests for private personal details.
        Do not confuse a sport term in a general technique question with a catalog query.
        """,
        """
        Member: never expose other members/classmates or rosters, even if requested by name. Only own records and public offerings.
        For recommendations distinguish published/open enrollment from InProgress; do not present a full or already-enrolled class as a new enrollment opportunity.
        Explain alternatives and price criteria. Never infer experience level from a class name alone; if no verified level exists, say so.
        Court rental catalog does not prove a slot is available or its current price. Use the actual booking interface for live quotes.
        Distinguish Points Available/Held, enrollment vs attendance, membership expiry vs status, AI preview vs saved plan.
        Self-reported health/fitness data is not a diagnosis. Chat is not the workout generator and cannot save a plan.
        """,
        """
        Overview: /member. Services: /member/services, My services for owned items; Explore packages for new offers.
        My schedule: calendar and enrolled class detail. Training: Fitness profile, saved plans and Workout Suggestions.
        Billing: Point wallet, Invoices, Point refunds. Help: Send a request, My requests. Notifications: bell icon.
        Court rental: Services > Explore packages > Court rental > Select; choose sport, date, room and consecutive slots; then checkout using actual quote.
        Account: profile menu > Account. Do not claim that an operation was performed.
        """, MemberVerifiedQueryV28.IsOtherMemberRequest);

    public static IReadOnlyList<string> AllowedTopics => Array.AsReadOnly(Policy.Topics);
    public static Task<Flow6Result> RunAsync(IAiChatProvider provider, string publishedPrompt,
        string question, string? precedingQuestion, DateTime nowUtc,
        Func<string, CancellationToken, Task<object>> loadEvidence, CancellationToken ct = default) =>
        Flow6ChatEngine.RunAsync(Policy, provider, publishedPrompt, question, precedingQuestion, nowUtc, loadEvidence, ct);

    internal static Task<object> LoadAsync(ISportHubDbContext db, Guid memberId, string topic,
        DateTime now, CancellationToken ct) => topic == "explorePackages"
        ? CatalogAsync(db, memberId, now, ct)
        : MemberGeminiDataHubV26.LoadAsync(db, memberId, topic, now, ct);

    private static async Task<object> CatalogAsync(ISportHubDbContext db, Guid id, DateTime now, CancellationToken ct)
    {
        // Keep the original backend-computed exact counts/price extremes; add verified schedule facts and bounded status.
        var original = await MemberGeminiDataHubV26.LoadAsync(db, id, "explorePackages", now, ct);
        var q = db.Set<Class>().AsNoTracking().Where(c => c.EnrollmentOpen &&
            (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress));
        var total = await q.CountAsync(ct);
        var candidates = await q.OrderBy(c => c.StartDate).ThenBy(c => c.ClassId).Take(70)
            .Select(c => new { c.ClassId, c.Code, c.Name, c.Price, c.StartDate, c.Status,
                c.Capacity, c.ReservedCount, c.ConfirmedCount, c.NumSessions,
                sport = c.Sport != null ? c.Sport.Name : null }).ToListAsync(ct);
        var ids = candidates.Select(c => c.ClassId).ToList();
        var already = await db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == id &&
            e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null && ids.Contains(e.ClassId))
            .Select(e => e.ClassId).Distinct().ToListAsync(ct);
        var sessions = await db.Set<ClassSession>().AsNoTracking().Where(s => ids.Contains(s.ClassId) &&
            s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc >= now)
            .OrderBy(s => s.StartAtUtc).Take(501).Select(s => new { s.ClassId, s.StartAtUtc, s.EndAtUtc }).ToListAsync(ct);
        var rows = candidates.Select(c => new { c.Code, c.Name, c.Price, c.StartDate,
            status = c.Status.ToString(), c.sport, c.NumSessions, c.Capacity, c.ConfirmedCount,
            availableSeats = Math.Max(0, c.Capacity - c.ReservedCount), alreadyEnrolled = already.Contains(c.ClassId),
            firstUpcomingSessions = sessions.Take(500).Where(s => s.ClassId == c.ClassId).Take(3).Select(s => new
            {
                startsAtVietnam = VietnamTime.ToLocal(s.StartAtUtc).ToString("yyyy-MM-dd HH:mm"),
                endsAtVietnam = VietnamTime.ToLocal(s.EndAtUtc).ToString("yyyy-MM-dd HH:mm")
            }) });
        return new { original, classRecommendationEvidence = rows, exactOpenClassCount = total,
            classesTruncated = total > candidates.Count, sessionsTruncated = sessions.Count > 500,
            note = "Use actual capacity minus reserved seats and current enrollment status. Only up to 3 upcoming scheduled sessions per displayed class; class level is not a verified column. Open enrollment is not a guaranteed successful checkout. Always distinguish already enrolled, full and in-progress classes. If evidence is truncated, do not assert no other class exists." };
    }
}
