using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.AI.Application.Services.Flow6;

public static class CoachFlow6Chat
{
    private static readonly Flow6Policy Policy = new("Coach",
        ["overview", "account", "classes", "schedule", "students", "attendance", "plans", "progress",
         "notifications", "requests", "absenceRequests", "studentMetrics"],
        """
        Use classes for assigned classes; schedule for this Coach's actual teaching sessions.
        A question asking to suggest a badminton class means select from this Coach's assigned classes only; never choose the Member catalog.
        For a public purchasing/enrollment recommendation outside Coach scope, CLARIFY or ACTION_DENIED, never use Member tools.
        For student roster use students, for attendance use attendance; for stored lesson plans use plans; for recorded assessments/homework use progress.
        For numerical height, weight, BMI or training-day comparisons among assigned students select studentMetrics, not arbitrary private medical records.
        Use requests for assigned support requests; absenceRequests for this Coach's own absence requests.
        Use account only for own profile. Other Coaches' identity/profile/schedule/contact and unassigned students' private records are PRIVACY_DENIED.
        General coaching advice and sport technique do not require an actual roster or schedule.
        """,
        """
        Coach: only your own assigned classes, actual assigned sessions, currently authorized students and own records are permitted.
        Never expose other Coaches' records. Never expose students' contact, billing, credentials or sensitive clinical details.
        Respect the difference between direct class assignment and a substitute session; do not claim an unassigned class or student.
        Use named students only when actually present in authorized evidence; do not reconstruct a private record from a name in the question.
        For student metrics use only backend-computed figures; never diagnose or equate BMI with performance.
        Do not invent results or forecast attendance. A missing result or attendance record is not an absence/failure.
        Coaches cannot create a class or session; Center Manager owns that workflow. Chat cannot mutate records.
        Lesson plans are editable in teaching workspace; chat advice is not a saved plan or a call to the Coach AI Plan generator.
        """,
        """
        Schedule (/coach/schedule) shows actual assigned teaching sessions. Classes (/coach/classes) shows assigned classes.
        Students (/coach/members) lists authorized students. Attendance (/coach/attendance) shows eligible assigned sessions and recorded attendance; do not claim permission to mark it unless verified.
        Classes > assigned class > Plans > Lesson plan > Session or Personal plan > select eligible session/student > AI lesson suggestions > Training goal and Experience > Generate suggestion > review > Use this suggestion > Save to SportHub.
        Request (/coach/support): Member support for assigned requests; Absence requests for own absence requests. Submit eligible absence request from Schedule.
        Account: profile menu > Account > Personal Information or Coach profile. Certificates & awards > Add document; combined limit 20.
        Notifications: bell icon. Do not invent a button or claim a successful operation.
        """, CoachPeerPrivacyV29.IsOtherCoachRequest);

    public static IReadOnlyList<string> AllowedTopics => Array.AsReadOnly(Policy.Topics);
    public static Task<Flow6Result> RunAsync(IAiChatProvider provider, string publishedPrompt,
        string question, string? precedingQuestion, DateTime nowUtc,
        Func<string, CancellationToken, Task<object>> loadEvidence, CancellationToken ct = default) =>
        Flow6ChatEngine.RunAsync(Policy, provider, publishedPrompt, question, precedingQuestion, nowUtc, loadEvidence, ct);

    internal static Task<object> LoadAsync(ISportHubDbContext db, Guid coachId, string topic,
        string question, DateTime now, CancellationToken ct) => CoachFlow6Evidence.LoadAsync(db, coachId, topic, question, now, ct);
}
