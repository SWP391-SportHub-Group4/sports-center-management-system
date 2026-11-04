using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>Read-only, Coach-scoped chat data and verified Coach UI guidance.
/// No AI Plan generator, Member router or shared intent handler is called here.</summary>
internal static class CoachChatRuntime
{
    private static string Normalize(string? raw)
    {
        var decomposed = (raw ?? "").Normalize(NormalizationForm.FormD);
        var chars = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                chars.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return Regex.Replace(chars.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }

    private static bool Has(string q, params string[] tokens) =>
        tokens.Any(t => (" " + q + " ").Contains(" " + t + " ", StringComparison.Ordinal));
    private static bool Contains(string q, params string[] fragments) =>
        fragments.Any(t => q.Contains(t, StringComparison.Ordinal));
    private static bool Vi(string raw) => Regex.IsMatch(raw, @"[À-ỹà-ỹđĐ]") ||
        Has(Normalize(raw), "lop", "lich", "day", "hoc vien", "mon", "yeu cau", "chua", "bao nhieu", "tao", "giao an", "ke hoach", "buoi", "hom nay");
    private static TimeZoneInfo VietnamTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
    }
    private static DateTime VnNow(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), VietnamTimeZone());
    private static string DateVN(DateTime utc) =>
        VnNow(utc).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);

    private sealed record ClassInfo(int Id, string Name, string Sport, string Status);
    private sealed record SessionInfo(Guid Id, int ClassId, string Name, DateTime StartAtUtc, DateTime EndAtUtc,
        string Status, string Sport, string Room);
    private sealed record StudentInfo(int ClassId, string Name);
    private sealed record SupportInfo(Guid Id, string Subject, string Status, string MemberName,
        DateTime CreatedAt, DateTime DeadlineUtc, string? ProgressNote, DateTime? ClosedAt);
    private sealed record Snapshot(DateTime GeneratedAtUtc,
        IReadOnlyList<ClassInfo> Classes, IReadOnlyList<SessionInfo> Sessions,
        IReadOnlyList<StudentInfo> Students, IReadOnlyList<SupportInfo> Support,
        int SupportTotal, bool SupportTruncated);

    private static async Task<Snapshot> LoadAsync(ISportHubDbContext db, Guid coachId, DateTime utc, CancellationToken ct)
    {
        var classes = await CoachDataScope.Classes(db, coachId)
            .OrderBy(c => c.Name)
            .Select(c => new ClassInfo(c.ClassId, c.Name,
                c.Sport != null ? c.Sport.Name : "Unknown", c.Status.ToString()))
            .Take(100).ToListAsync(ct);

        // Query actual session coach. Substitute sessions may not match default class coach.
        // Do not infer that there are no assigned classes from an empty session date window.
        var sessions = await db.Set<ClassSession>().AsNoTracking()
            .Where(s => s.CoachId == coachId && s.StartAtUtc >= utc.AddDays(-365))
            .OrderByDescending(s => s.StartAtUtc)
            .Select(s => new SessionInfo(s.SessionId, s.ClassId,
                s.Class != null ? s.Class.Name : "Unknown", s.StartAtUtc, s.EndAtUtc,
                s.Status.ToString(), s.Class != null && s.Class.Sport != null ? s.Class.Sport.Name : "Unknown",
                s.Room != null ? s.Room.Name : "Unknown"))
            .Take(400).ToListAsync(ct);

        // Use the same UserAccount/Profile relationship as the authorized teaching/students API.
        // Keep enrollment scope on the server; do not expose unrelated users.
        var students = await AuthorizedStudentsAsync(db, coachId, null, 300, ct);

        var supportQuery = db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(r => r.AssignedToUserId == coachId);
        var supportTotal = await supportQuery.CountAsync(ct);
        var support = await (
            from r in supportQuery
            join p in db.Set<UserProfile>().AsNoTracking() on r.MemberId equals p.UserId into profiles
            from p in profiles.DefaultIfEmpty()
            orderby r.CreatedAt descending
            select new SupportInfo(r.RequestId, r.Subject, r.Status,
                p != null ? p.FullName : "Name unavailable", r.CreatedAt,
                r.SlaDueAtUtc, r.ProgressNote, r.ClosedAt))
            .Take(150).ToListAsync(ct);
        return new Snapshot(utc, classes, sessions, students, support,
            supportTotal, supportTotal > support.Count);
    }

    internal static async Task<string> BuildContextAsync(ISportHubDbContext db, Guid coachId, DateTime now, CancellationToken ct)
    {
        var s = await LoadAsync(db, coachId, now, ct);
        return JsonSerializer.Serialize(new {
            role = "Coach",
            scope = new { coachId, authorized = true },
            generatedAtUtc = now,
            coachClasses = s.Classes,
            coachSessions = s.Sessions,
            enrolledStudents = s.Students,
            assignedSupportRequests = s.Support,
            assignedSupportTotal = s.SupportTotal,
            supportTruncated = s.SupportTruncated,
            rules = "Read-only authorized Coach records. Treat missing/truncated data as unknown, not proof of absence. No staff-wide Member lookup. Never imply chat can create classes or schedules. AI lesson plan is accessible via Coach's teaching workflow; this context service never generates plans."
        });
    }

    private static string StatusBucket(string status) => status.ToUpperInvariant() switch
    {
        "OPEN" or "ASSIGNED" => "Not started",
        "IN_PROGRESS" => "In progress",
        "DONE" or "CLOSED" => "Done",
        _ => "Other"
    };

    // These are semantic intents. The handler never treats 'member', 'class', or 'training' alone as a Request.
    private static string Intent(string q)
    {
        bool plan = Contains(q, "giao an", "lesson plan", "training plan", "ai lesson", "ai suggestion", "ke hoach tap", "ke hoach day", "bai tap", "lich tap train", "lich tap luyen", "soan bai", "lap plan", "tao plan");
        bool request = Has(q, "request", "requests", "yeu cau") || Contains(q, "ho tro duoc giao", "member support", "absence request", "yeu cau vang", "bao vang");
        bool certificates = Contains(q, "chung chi", "bang cap", "chung nhan", "certificate", "award");
        bool avatar = Contains(q, "avatar", "anh dai dien");
        bool createSchedule = Contains(q, "tao lich hoc", "tao lich day", "tao buoi hoc", "create class", "create schedule", "tao lop moi", "tao lop hoc");
        bool how = Has(q, "o dau", "nut", "cach", "lam sao", "huong dan", "how", "where", "tao", "soan", "cap nhat", "them");
        if (avatar || certificates) return "account";
        if (plan) return "plan"; // must precede class/schedule create restriction
        if (createSchedule) return "create-class";
        if (request) return "request";
        bool roster = Contains(q, "hoc vien", "member nao", "member trong", "student", "ai hoc", "ai tham gia", "dang day cho ai", "students nao", "member nao toi dang day", "who attends", "who are enrolled", "si so", "bao nhieu nguoi");
        bool sport = Contains(q, "mon gi", "mon nao", "mon the thao", "which sport", "what sport", "dang day mon");
        bool scheduleSubject = Contains(q, "lich", "lop", "buoi", "day", "session", "class", "schedule", "teaching");
        bool schedule = Contains(q, "lich day", "lich hoc", "lop hoc gan nhat", "lop day gan nhat", "buoi day", "buoi hoc", "next class", "next session", "teaching schedule") ||
            (scheduleSubject && Contains(q, "tiep theo", "gan nhat", "hom nay", "ngay mai", "tuan nay", "tuan sau", "thang nay", "da qua", "da day", "qua khu", "upcoming", "yesterday", "today", "tomorrow", "this week", "next week", "this month"));
        bool classes = Contains(q, "lop toi", "lop dang day", "lop nao", "lop duoc", "my class", "assigned class", "bao nhieu lop", "cac lop", "danh sach lop", "day class nao", "dang day class", "class nao", "lop nao toi dang day", "lop toi dang phu trach");
        if (roster) return "roster";
        if (sport) return "sport";
        if (schedule) return "schedule";
        if (classes) return "classes";
        return how ? "navigation" : "other";
    }

    // Verified Coach navigation: no Gemini request and no business data query required.
    // This method is intentionally Coach-only; it must be called after authenticated role verification.
    internal static string? TryStaticNavigationAnswer(string question)
    {
        // Coach notification data must not be converted into a generic navigation answer.
        if (CoachNotificationAnswers.IsNotificationDataQuestion(question)) return null;
        var coachClassesStudentsNavigation = CoachClassesStudentsNavigation.TryAnswer(question);
        if (coachClassesStudentsNavigation is not null) return coachClassesStudentsNavigation;
        var q = Normalize(question);
        var vi = Vi(question);
        if (Contains(q, "ban la ai", "who are you", "what are you"))
            return vi
                ? "Tôi là Wolf, trợ lý SportHub dành cho Coach. Tôi có thể hướng dẫn Schedule, Classes, Students, Request, Account và hỗ trợ tra cứu dữ liệu giảng dạy được phân quyền."
                : "I am Wolf, SportHub's Coach assistant. I can guide you through Schedule, Classes, Students, Request, and Account, and help retrieve authorized teaching information.";

        // Profile visibility is distinct from editing personal information.
        if (Contains(q, "profile cong khai", "ho so cong khai", "public profile", "view public profile", "xem profile", "xem ho so coach"))
            return vi
                ? "Để xem hồ sơ Coach công khai: mở menu tài khoản → Account (/account) → Coach profile → View public profile. Bạn cũng có thể xem đường dẫn /coaches/{coachId} của chính mình; không tự điền CoachId khi chưa xác minh."
                : "To view your public Coach profile: account menu → Account (/account) → Coach profile → View public profile. The public page is /coaches/{coachId}, using your verified Coach ID.";

        if (Contains(q, "xem lop o dau", "danh sach lop o dau", "classes o dau", "where are my classes", "view classes"))
            return vi ? "Chọn Classes trên thanh điều hướng Coach hoặc mở /coach/classes để xem các lớp được phân công. Chọn lớp để xem chi tiết."
                      : "Open Classes in Coach navigation or go to /coach/classes; select an assigned class for details.";
        if (Contains(q, "xem hoc vien o dau", "students o dau", "where are my students", "view students"))
            return vi ? "Chọn Students trên thanh điều hướng Coach hoặc mở /coach/members. Chỉ những học viên thuộc phạm vi bạn được phép xem mới xuất hiện."
                      : "Open Students in Coach navigation or go to /coach/members. Only authorized students are shown.";
        if (Contains(q, "diem danh o dau", "attendance o dau", "where is attendance"))
            return vi ? "Vào Schedule hoặc Classes, chọn buổi được phân công để thực hiện thao tác điểm danh nếu buổi đó đủ điều kiện; trang Attendance của Coach ở /coach/attendance."
                      : "Open Schedule or Classes and select an eligible assigned session for attendance. The Coach Attendance page is /coach/attendance.";

        if (Contains(q, "thong bao", "notification", "notifications", "chuong thong bao", "bell"))
            return vi
                ? "Để xem thông báo, chọn biểu tượng chuông ở thanh điều hướng hoặc mở trang Notifications (/notifications), rồi chọn thông báo cần xem."
                : "To view notifications, select the bell icon in the top navigation or open Notifications (/notifications), then select a notification.";

        if (Contains(q, "thong tin ca nhan", "thong tin tai khoan", "cap nhat ho so", "ho so ca nhan", "update profile", "edit profile", "personal information", "my profile", "account settings"))
            return vi
                ? "Để cập nhật thông tin cá nhân: mở menu tài khoản ở góc trên bên phải → Account (/account) → Personal Information → chỉnh thông tin → Save profile."
                : "To update your profile: open the account menu in the upper-right → Account (/account) → Personal Information → edit the fields → Save profile.";

        if (Contains(q, "lich day", "lich hoc", "schedule", "thoi khoa bieu", "buoi day", "my timetable") &&
            Contains(q, "o dau", "xem", "mo", "truy cap", "nut", "where", "how to view", "open", "find"))
            return vi
                ? "Để xem lịch dạy, chọn Schedule trên thanh điều hướng Coach hoặc mở /coach/schedule. Chọn buổi học để xem chi tiết; Coach không có quyền tạo lịch lớp mới."
                : "To view your teaching schedule, open Schedule in Coach navigation or go to /coach/schedule. Select a session for details; Coaches cannot create new class schedules.";

        // Certificates and awards share one 20-document limit in CoachCredentialService.
        // A quantity question must not fall through to the generic upload instructions.
        if (Contains(q, "chung chi", "chung nhan", "bang cap", "certificate", "awards") &&
            Contains(q, "bao nhieu", "toi da", "gioi han", "may cai", "maximum", "how many", "limit"))
            return vi
                ? "Bạn có thể lưu tối đa 20 tài liệu trong mục Certificates & awards (tính gộp chứng chỉ và giải thưởng). Để biết còn bao nhiêu chỗ trống, mở Account → Certificates & awards và xem chỉ số số tài liệu/20."
                : "You can keep up to 20 documents in Certificates & awards combined (certificates and awards). Check Account → Certificates & awards for your current count out of 20.";

        if (Contains(q, "chung chi", "chung nhan", "bang cap", "certificate", "awards"))
            return vi
                ? "Để thêm chứng chỉ: menu tài khoản → Account (/account) → Certificates & awards → Add document → chọn tệp và lưu."
                : "To add a certificate: account menu → Account (/account) → Certificates & awards → Add document → upload and save.";
        if (Contains(q, "avatar", "anh dai dien"))
            return vi
                ? "Đổi avatar: menu tài khoản → Account (/account) → Personal Information → Browse → chọn ảnh, rồi lưu theo nút hiển thị."
                : "To update your avatar: account menu → Account (/account) → Personal Information → Browse → select an image, then save.";

        if (Contains(q, "request o dau", "yeu cau o dau", "xem request", "xem yeu cau", "where are requests"))
            return vi
                ? "Vào Request (/coach/support). Tab Member support hiển thị yêu cầu hỗ trợ được giao; tab Absence requests dành cho yêu cầu vắng của Coach."
                : "Open Request (/coach/support). Member support contains assigned support requests; Absence requests is for Coach absence requests.";

        // Unknown UI navigation phrasing: a normal answer rather than a generic 502/provider error.
        if (Contains(q, "o dau", "nut nao", "how do i find", "where is the button") &&
            !Contains(q, "bao nhieu", "may", "who", "ai", "khi nao"))
            return vi
                ? "Tôi chưa hiểu rõ thao tác bạn muốn tìm. Bạn có thể cho biết tên chức năng hoặc trang trên SportHub không?"
                : "I did not understand which action you mean. Could you name the SportHub feature or page?";
        return null;
    }

    internal static string ClassifyIntentForTests(string question) => Intent(Normalize(question));

    internal static async Task<string?> TryAnswerAsync(ISportHubDbContext db, Guid coachId,
        string question, DateTime now, CancellationToken ct)
    {
        // Coach-only, JWT-scoped notification query before shared context or Gemini.
        var notificationAnswerV9 = await CoachNotificationAnswers.TryAnswerAsync(db, coachId, question, now, ct);
        if (notificationAnswerV9 is not null) return notificationAnswerV9;
        var detailsAnswer = await CoachClassStudentKnowledge.TryAnswerAsync(db, coachId, question, ct);
        if (detailsAnswer is not null) return detailsAnswer;
        var staticAnswer = TryStaticNavigationAnswer(question);
        if (staticAnswer is not null) return staticAnswer;
        var q = Normalize(question);
        var vi = Vi(question);
        switch (Intent(q))
        {
            case "account":
            {
                var parts = new List<string>();
                if (Contains(q, "avatar", "anh dai dien"))
                    parts.Add(vi ? "Đổi avatar: menu tài khoản → Account → Personal Information → Browse → chọn ảnh → lưu ảnh theo nút hiển thị." :
                        "Avatar: account menu → Account → Personal Information → Browse → select an image → save using the available button.");
                if (Contains(q, "chung chi", "bang cap", "chung nhan", "certificate", "award"))
                    parts.Add(vi ? "Chứng chỉ: menu tài khoản → Account → Certificates & awards → Add document → chọn tệp và hoàn tất biểu mẫu." :
                        "Certificates: account menu → Account → Certificates & awards → Add document → upload a file and complete the form.");
                return string.Join("\n", parts);
            }
            case "plan":
                return vi
                    ? "Coach có thể tạo giáo án cho lớp hoặc học viên được phân công, nhưng Wolf chỉ hướng dẫn chứ không tạo giáo án trong chat. Vào Classes → chọn lớp → mục Plans/Teaching → Lesson plan. Chọn buổi học hoặc học viên phù hợp, nhập nội dung hoặc dùng AI lesson suggestions: Training goal → Experience → Generate suggestion → xem lại → Use this suggestion → Save. Không nhầm với việc tạo lớp/lịch dạy mới (quyền Manager)."
                    : "Coaches may prepare lesson plans for assigned classes/members, but Wolf does not create one in chat. Open Classes → assigned class → Plans/Teaching → Lesson plan. Choose the applicable session/member, enter the content or use AI lesson suggestions: Training goal → Experience → Generate suggestion → review → Use this suggestion → Save. Creating classes or scheduling sessions is a separate Manager operation.";
            case "create-class":
                return vi ? "Coach không có quyền tạo lớp hoặc sắp lịch buổi học mới. Bạn có thể xem Schedule/Classes và gửi yêu cầu thay đổi đúng quy trình." :
                    "Coaches cannot create classes or schedule new sessions. View Schedule/Classes and use the appropriate change-request workflow.";
            case "request":
                return await RequestAnswerAsync(db, coachId, q, now, vi, ct);
            case "roster":
                return await RosterAnswerAsync(db, coachId, q, now, vi, ct);
            case "sport":
            case "classes":
                return await ClassesAnswerAsync(db, coachId, q, vi, ct);
            case "schedule":
                return await ScheduleAnswerAsync(db, coachId, q, now, vi, ct);
            default:
                return null;
        }
    }

    private static async Task<string> RequestAnswerAsync(ISportHubDbContext db, Guid coachId,
        string q, DateTime now, bool vi, CancellationToken ct)
    {
        if (Contains(q, "may trang thai", "nhung trang thai", "cac trang thai", "status", "statuses"))
            return vi ? "Member support có ba nhóm tiến độ trên UI: Not started (OPEN/ASSIGNED), In progress (IN_PROGRESS) và Done (DONE/CLOSED). Overdue là nhóm quá hạn SLA đối với request chưa Done, không phải trạng thái xử lý thứ tư. Absence requests có workflow khác ở tab riêng." :
                "Member support displays Not started (OPEN/ASSIGNED), In progress (IN_PROGRESS), Done (DONE/CLOSED), and Overdue (an SLA condition, not a fourth workflow status). Absence requests use a separate lifecycle.";
        if (Contains(q, "request o dau", "yeu cau o dau", "gui request", "tao request", "how to request", "where to request"))
            return vi ? "Vào Request → Member support để xem/xử lý request được giao. Tab Absence requests dùng để theo dõi yêu cầu vắng. Coach không tạo Member support request tại đây; yêu cầu vắng phù hợp được gửi từ Schedule." :
                "Open Request → Member support to handle assigned support. Absence requests are in a separate tab; eligible absence requests start from Schedule. Coaches cannot create Member support requests in this tab.";
        var baseQuery = db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(r => r.AssignedToUserId == coachId);
        var count = await baseQuery.CountAsync(ct);
        var items = await (from r in baseQuery
            join p in db.Set<UserProfile>().AsNoTracking() on r.MemberId equals p.UserId into names
            from p in names.DefaultIfEmpty()
            orderby r.CreatedAt descending
            select new SupportInfo(r.RequestId, r.Subject, r.Status,
                p != null ? p.FullName : "Name unavailable", r.CreatedAt,
                r.SlaDueAtUtc, r.ProgressNote, r.ClosedAt))
            .Take(200).ToListAsync(ct);
        bool overdue = Contains(q, "qua han", "tre han", "overdue");
        bool finished = Contains(q, "da done", "done", "hoan thanh", "da xu ly xong", "completed", "closed");
        bool unanswered = Contains(q, "chua tra loi", "chua phan hoi", "unanswered", "not replied");
        bool pending = unanswered || Contains(q, "chua xu ly", "chua lam", "not started", "pending", "in progress", "dang xu ly");
        bool who = Contains(q, "ai gui", "hoi vien nao", "ten hoi vien", "member nao", "who sent", "who submitted");
        bool countOnly = Contains(q, "bao nhieu", "so luong", "how many", "count");
        IEnumerable<SupportInfo> matched = items;
        string scope = vi ? "được giao" : "assigned";
        if (overdue) { matched = matched.Where(x => x.DeadlineUtc < now && StatusBucket(x.Status) != "Done"); scope = "Overdue"; }
        else if (finished) { matched = matched.Where(x => StatusBucket(x.Status) == "Done"); scope = "Done"; }
        else if (pending) { matched = matched.Where(x => StatusBucket(x.Status) == "Not started" || StatusBucket(x.Status) == "In progress"); scope = vi ? "chưa hoàn tất" : "not completed"; }
        if (unanswered)
        {
            // We can verify only recorded progress/done events by this Coach, not external replies.
            var ids = items.Select(x => x.Id).ToArray();
            var repliedIds = await db.Set<MemberSupportEvent>().AsNoTracking()
                .Where(e => ids.Contains(e.RequestId) && e.ActorUserId == coachId &&
                    (e.Type == "PROGRESS" || e.Type == "DONE"))
                .Select(e => e.RequestId).Distinct().ToListAsync(ct);
            var repliedSet = repliedIds.ToHashSet();
            matched = matched.Where(x => !repliedSet.Contains(x.Id));
            scope = vi ? "chưa ghi nhận phản hồi PROGRESS/DONE của bạn" : "without your recorded PROGRESS/DONE action";
        }
        var result = matched.ToList();
        if (count == 0) return vi ? "Chưa thấy Member support request nào được phân công cho tài khoản Coach hiện tại." : "No Member support requests are assigned to this Coach account.";
        if (countOnly && !who && !pending && !finished && !overdue)
            return vi ? $"Bạn có {count} Member support request được phân công (không phải request do Coach tự tạo)." : $"You have {count} assigned Member support requests.";
        if (result.Count == 0) return vi ? $"Không tìm thấy request {scope} trong {items.Count} request gần nhất được phép xem." : $"No {scope} requests in the latest {items.Count} authorized records.";
        var summary = vi ? $"Có {result.Count}{(count > items.Count ? "+" : "")} request {scope} trong dữ liệu được phép xem:" :
            $"{result.Count}{(count > items.Count ? "+" : "")} {scope} requests in authorized data:";
        var rows = result.Take(20).Select((x, i) =>
            $"{i + 1}. {x.MemberName} — {x.Subject} — {StatusBucket(x.Status)}" +
            (overdue ? $" — deadline {DateVN(x.DeadlineUtc)}" : ""));
        var qualifier = unanswered ? (vi ? "\nKết quả dựa vào sự kiện PROGRESS/DONE của bạn trong hệ thống; không kiểm tra phản hồi ngoài SportHub." :
            "\nBased on your recorded PROGRESS/DONE events; replies outside SportHub are not observable.") :
            pending ? (vi ? "\nChưa Done không đồng nghĩa chắc chắn chưa trả lời. Xem Activity để đối chiếu." :
            "\nNot Done does not prove no reply was sent. Check Activity.") : "";
        return summary + "\n" + string.Join("\n", rows) + qualifier +
            (count > items.Count ? "\nResult truncated. Use Request → Member support for full history." : "");
    }

    private static async Task<string> ClassesAnswerAsync(ISportHubDbContext db, Guid coachId,
        string q, bool vi, CancellationToken ct)
    {
        var classes = await CoachDataScope.Classes(db, coachId)
            .OrderBy(x => x.Name)
            .Select(x => new ClassInfo(x.ClassId, x.Name,
                x.Sport != null ? x.Sport.Name : "Unknown", x.Status.ToString()))
            .Take(100).ToListAsync(ct);
        if (classes.Count == 0) return vi ? "Không tìm thấy lớp Published/InProgress được phân công trực tiếp cho tài khoản Coach. Điều này không loại trừ buổi dạy thay; xem Schedule." :
            "No directly assigned Published/InProgress classes found. Substitute sessions may still appear in Schedule.";
        bool countOnly = Contains(q, "bao nhieu", "how many", "count");
        bool sport = Contains(q, "mon gi", "mon nao", "mon the thao", "which sport", "what sport", "dang day mon");
        if (sport)
        {
            var sports = classes.Select(x => x.Sport).Where(s => s != "Unknown").Distinct().ToArray();
            return (vi ? "Các môn trong lớp được phân công: " : "Sports of assigned classes: ") + string.Join(", ", sports) + ".";
        }
        if (countOnly) return vi ? $"Bạn được phân công {classes.Count} lớp Published/InProgress trong phạm vi đang truy vấn." :
            $"You have {classes.Count} directly assigned Published/InProgress classes in the queried scope.";
        return (vi ? $"Các lớp được phân công ({classes.Count}):" : $"Assigned classes ({classes.Count}):") + "\n" +
            string.Join("\n", classes.Take(25).Select((x,i) => $"{i + 1}. {x.Name} — {x.Sport} — {x.Status}"));
    }

    private static async Task<string> ScheduleAnswerAsync(ISportHubDbContext db, Guid coachId,
        string q, DateTime now, bool vi, CancellationToken ct)
    {
        var vn = VnNow(now);
        DateTime? from = null, to = null;
        if (Contains(q, "hom nay", "today")) { from = vn.Date; to = from.Value.AddDays(1); }
        else if (Contains(q, "ngay mai", "tomorrow")) { from = vn.Date.AddDays(1); to = from.Value.AddDays(1); }
        else if (Contains(q, "hom qua", "yesterday")) { from = vn.Date.AddDays(-1); to = vn.Date; }
        else if (Contains(q, "tuan nay", "this week")) { from = vn.Date.AddDays(-((int)vn.DayOfWeek + 6) % 7); to = from.Value.AddDays(7); }
        else if (Contains(q, "tuan sau", "next week")) { from = vn.Date.AddDays(-((int)vn.DayOfWeek + 6) % 7).AddDays(7); to = from.Value.AddDays(7); }
        else if (Contains(q, "thang nay", "this month")) { from = new DateTime(vn.Year, vn.Month, 1); to = from.Value.AddMonths(1); }

        var query = db.Set<ClassSession>().AsNoTracking().Where(s => s.CoachId == coachId);
        // Convert local date boundaries to UTC in the LINQ query.
        if (from.HasValue && to.HasValue)
        {
            var offset = TimeSpan.FromHours(7);
            var startUtc = DateTime.SpecifyKind(from.Value - offset, DateTimeKind.Utc);
            var endUtc = DateTime.SpecifyKind(to.Value - offset, DateTimeKind.Utc);
            query = query.Where(s => s.StartAtUtc >= startUtc && s.StartAtUtc < endUtc);
        }
        else if (Contains(q, "da qua", "qua khu", "da day", "previous", "past", "gan day nhat trong qua khu"))
            query = query.Where(s => s.StartAtUtc < now);
        else
            query = query.Where(s => s.StartAtUtc >= now && s.Status == ClassSessionStatus.Scheduled);
        bool past = Contains(q, "da qua", "qua khu", "da day", "previous", "past", "gan day nhat trong qua khu");
        query = past && !from.HasValue ? query.OrderByDescending(s => s.StartAtUtc) : query.OrderBy(s => s.StartAtUtc);
        var sessions = await query.Select(s => new SessionInfo(s.SessionId, s.ClassId,
            s.Class != null ? s.Class.Name : "Unknown", s.StartAtUtc, s.EndAtUtc,
            s.Status.ToString(), s.Class != null && s.Class.Sport != null ? s.Class.Sport.Name : "Unknown",
            s.Room != null ? s.Room.Name : "Unknown"))
            .Take(100).ToListAsync(ct);
        if (sessions.Count == 0)
            return vi ? "Không tìm thấy buổi dạy trong phạm vi thời gian vừa hỏi của Coach đăng nhập. Thử đổi khoảng ngày ở Schedule; kết quả này không chứng minh bạn không có lớp." :
                "No Coach sessions were found for the requested date range. Check Schedule with another range; this does not prove you have no assigned classes.";
        bool nearest = Contains(q, "gan nhat", "tiep theo", "next class", "next session");
        bool howMany = Contains(q, "bao nhieu", "how many", "so buoi");
        if (howMany && !nearest)
            return vi ? $"Có {sessions.Count} buổi dạy trong phạm vi đã truy vấn (tối đa 100 kết quả)." :
                $"Found {sessions.Count} sessions in the queried range (up to 100 results).";
        int limit = nearest ? 1 : Math.Min(10, sessions.Count);
        return (vi ? "Lịch dạy theo phạm vi yêu cầu (giờ Việt Nam):" : "Authorized teaching sessions (Vietnam time):") + "\n" +
            string.Join("\n", sessions.Take(limit).Select((s,i) =>
                $"{i + 1}. {s.Name} — {DateVN(s.StartAtUtc)}–{DateVN(s.EndAtUtc)} — {s.Sport} — {s.Room} — {s.Status}")) +
            (sessions.Count > limit && !nearest ? "\nChỉ hiển thị một phần danh sách. Xem Schedule để xem thêm." : "");
    }

    // Two-phase query mirrors ClassTeachingService.StudentsAsync():
    //   CoachDataScope.Enrollments -> UserAccount -> UserProfile.
    // Explicitly project scalar IDs first so unrelated cross-module joins cannot break the roster query.
    private static async Task<List<StudentInfo>> AuthorizedStudentsAsync(
        ISportHubDbContext db, Guid coachId, int[]? classIds, int maxRows, CancellationToken ct)
    {
        var enrollments = CoachDataScope.Enrollments(db, coachId);
        if (classIds is not null)
            enrollments = enrollments.Where(e => classIds.Contains(e.ClassId));
        var items = await enrollments
            .OrderBy(e => e.ClassId).ThenBy(e => e.MemberId)
            .Select(e => new { e.ClassId, e.MemberId })
            .Distinct().Take(maxRows + 1).ToListAsync(ct);
        if (items.Count == 0) return new List<StudentInfo>();
        var memberIds = items.Select(e => e.MemberId).Distinct().ToArray();
        var users = await db.Set<UserAccount>().AsNoTracking()
            .Where(u => memberIds.Contains(u.UserId))
            .Select(u => new {
                u.UserId,
                Name = u.Profile != null ? u.Profile.FullName : u.Email
            }).ToListAsync(ct);
        var names = users.ToDictionary(x => x.UserId, x => x.Name);
        return items.Select(e => new StudentInfo(e.ClassId,
                names.TryGetValue(e.MemberId, out var name) && !string.IsNullOrWhiteSpace(name)
                    ? name : "Học viên chưa có tên hiển thị"))
            .ToList();
    }

    private static async Task<string> RosterAnswerAsync(ISportHubDbContext db, Guid coachId,
        string q, DateTime now, bool vi, CancellationToken ct)
    {
        var classes = await CoachDataScope.Classes(db, coachId)
            .Select(c => new { c.ClassId, c.Name }).Take(100).ToListAsync(ct);
        // Resolve class by exact normalized label, or use nearest assigned session for explicit deictic references.
        var requested = classes.FirstOrDefault(c => q.Contains(Normalize(c.Name), StringComparison.Ordinal));
        if (requested is null && Contains(q, "lop do", "gan nhat", "next class", "that class"))
        {
            var nextClassId = await db.Set<ClassSession>().AsNoTracking()
                .Where(s => s.CoachId == coachId && s.StartAtUtc >= now && s.Status == ClassSessionStatus.Scheduled)
                .OrderBy(s => s.StartAtUtc).Select(s => (int?)s.ClassId).FirstOrDefaultAsync(ct);
            requested = classes.FirstOrDefault(c => c.ClassId == nextClassId);
        }
        var classIds = requested is null ? classes.Select(c => c.ClassId).ToArray() : new[] { requested.ClassId };
        if (classIds.Length == 0)
            return vi ? "Chưa tìm thấy lớp đang được phân công để xác minh danh sách hội viên. Xem Classes → Students." :
                "No assigned classes were found for an authorized student lookup. Check Classes → Students.";
        var members = await AuthorizedStudentsAsync(db, coachId, classIds, 150, ct);
        if (members.Count == 0)
            return vi ? "Trong các lớp thuộc quyền xem của Coach, truy vấn không tìm thấy enrollment Confirmed còn hiệu lực. Kiểm tra Students để đối chiếu; kết quả này không khẳng định mọi lớp đều không có học viên." :
                "No active Confirmed enrollments were found for authorized assigned classes. Check Students.";
        bool onlyCount = Contains(q, "bao nhieu", "si so", "how many");
        var label = requested?.Name ?? "các lớp được phân công";
        if (onlyCount) return vi ? $"Có {members.Count}{(members.Count > 150 ? "+" : "")} bản ghi enrollment có hồ sơ tên trong {label}." :
            $"{members.Count}{(members.Count > 150 ? "+" : "")} authorized enrollment records with names for {label}.";
        var names = members.Take(150).GroupBy(x => x.ClassId)
            .Select(g => $"{classes.FirstOrDefault(c => c.ClassId == g.Key)?.Name ?? "Unknown class"}: " + string.Join(", ", g.Select(x => x.Name)));
        return (vi ? "Học viên ghi danh trong phạm vi lớp được phép xem:" : "Authorized enrolled students:") + "\n" + string.Join("\n", names) +
            (members.Count > 150 ? "\nDanh sách đã giới hạn; xem Students để kiểm tra thêm." : "");
    }
}
