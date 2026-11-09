using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SportHub.AI.Application.Services;

// AUTO-GENERATED from frontend routes by tools/sync_ai_navigation.py.
// Route existence is NOT proof of a button, permission, or executable workflow.
internal static class UiNavigationKnowledge
{
    private const string Json = """
{"routes":[{"id":"member.route.member.class-schedule","role":"member","route":"/member/class-schedule","title":"Class Schedule","source":"frontend/src/app/member/class-schedule/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.courses.[classId]","role":"member","route":"/member/courses/[classId]","title":"[Classid]","source":"frontend/src/app/member/courses/[classId]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.courses","role":"member","route":"/member/courses","title":"Courses","source":"frontend/src/app/member/courses/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.courts.book","role":"member","route":"/member/courts/book","title":"Book","source":"frontend/src/app/member/courts/book/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.discover.[id]","role":"member","route":"/member/discover/[id]","title":"[Id]","source":"frontend/src/app/member/discover/[id]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.discover","role":"member","route":"/member/discover","title":"Discover","source":"frontend/src/app/member/discover/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.finance","role":"member","route":"/member/finance","title":"Finance","source":"frontend/src/app/member/finance/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.help","role":"member","route":"/member/help","title":"Help","source":"frontend/src/app/member/help/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.invoices.[id]","role":"member","route":"/member/invoices/[id]","title":"[Id]","source":"frontend/src/app/member/invoices/[id]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.invoices","role":"member","route":"/member/invoices","title":"Invoices","source":"frontend/src/app/member/invoices/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.my-plans","role":"member","route":"/member/my-plans","title":"My Plans","source":"frontend/src/app/member/my-plans/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.my-registrations","role":"member","route":"/member/my-registrations","title":"My Registrations","source":"frontend/src/app/member/my-registrations/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member","role":"member","route":"/member","title":"Overview","source":"frontend/src/app/member/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.profile","role":"member","route":"/member/profile","title":"Profile","source":"frontend/src/app/member/profile/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.rentals.[rentalId]","role":"member","route":"/member/rentals/[rentalId]","title":"[Rentalid]","source":"frontend/src/app/member/rentals/[rentalId]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.rentals","role":"member","route":"/member/rentals","title":"Rentals","source":"frontend/src/app/member/rentals/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.schedule","role":"member","route":"/member/schedule","title":"Schedule","source":"frontend/src/app/member/schedule/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.services.courses.[id]","role":"member","route":"/member/services/courses/[id]","title":"[Id]","source":"frontend/src/app/member/services/courses/[id]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.services","role":"member","route":"/member/services","title":"Services","source":"frontend/src/app/member/services/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.threshold","role":"member","route":"/member/threshold","title":"Threshold","source":"frontend/src/app/member/threshold/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.threshold-responses.[responseId]","role":"member","route":"/member/threshold-responses/[responseId]","title":"[Responseid]","source":"frontend/src/app/member/threshold-responses/[responseId]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.training","role":"member","route":"/member/training","title":"Training","source":"frontend/src/app/member/training/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.wallet","role":"member","route":"/member/wallet","title":"Wallet","source":"frontend/src/app/member/wallet/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.wallet.top-up","role":"member","route":"/member/wallet/top-up","title":"Top Up","source":"frontend/src/app/member/wallet/top-up/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.route.member.workout-suggestions","role":"member","route":"/member/workout-suggestions","title":"Workout Suggestions","source":"frontend/src/app/member/workout-suggestions/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.attendance","role":"coach","route":"/coach/attendance","title":"Attendance","source":"frontend/src/app/coach/attendance/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.change-requests","role":"coach","route":"/coach/change-requests","title":"Change Requests","source":"frontend/src/app/coach/change-requests/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.classes.[classId]","role":"coach","route":"/coach/classes/[classId]","title":"[Classid]","source":"frontend/src/app/coach/classes/[classId]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.classes","role":"coach","route":"/coach/classes","title":"Classes","source":"frontend/src/app/coach/classes/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.members.[memberId]","role":"coach","route":"/coach/members/[memberId]","title":"[Memberid]","source":"frontend/src/app/coach/members/[memberId]/page.tsx","verified":"route_only","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.members","role":"coach","route":"/coach/members","title":"Members","source":"frontend/src/app/coach/members/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach","role":"coach","route":"/coach","title":"Overview","source":"frontend/src/app/coach/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.schedule","role":"coach","route":"/coach/schedule","title":"Schedule","source":"frontend/src/app/coach/schedule/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.route.coach.support","role":"coach","route":"/coach/support","title":"Support","source":"frontend/src/app/coach/support/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"member.account","role":"member","route":"/account","title":"Account","source":"frontend/src/app/account/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]},{"id":"coach.account","role":"coach","route":"/account","title":"Account","source":"frontend/src/app/account/page.tsx","verified":"route_exists","steps":[],"api":[],"uiActions":[]}],"restrictions":{"coach.create_schedule":{"role":"coach","aliases":["tao lich hoc","them buoi hoc","create schedule","add session","new class","tao lop hoc"],"response_vi":"Coach không thể tự tạo lớp hoặc buổi học mới. Vào Schedule để xem lịch được phân công; liên hệ Center Manager nếu cần thay đổi lịch. Request chỉ dùng cho yêu cầu báo vắng hợp lệ.","response_en":"Coaches cannot create classes or new teaching sessions. Open Schedule to view assigned sessions; contact the Center Manager for schedule changes. Request supports eligible absence requests only."}}}
""";
    private static readonly JsonDocument Catalog = JsonDocument.Parse(Json);
    private static string Normalize(string value)
    {
        var d = (value ?? "").Normalize(NormalizationForm.FormD);
        var b = new StringBuilder();
        foreach (var ch in d)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                b.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        return Regex.Replace(b.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }
    private static bool Includes(string haystack, string needle) =>
        (" " + haystack + " ").Contains(" " + needle + " ", StringComparison.Ordinal);

    internal static bool IsNavigationQuestion(string question)
    {
        var q = Normalize(question);
        return new[] { "o dau", "lam sao", "cach", "huong dan", "thao tac", "nut", "button",
            "click", "how", "where", "create", "edit", "delete", "save", "open", "page", "menu", "tab", "vao dau" }
            .Any(signal => Includes(q, Normalize(signal)));
    }

    internal static string? TryAnswer(string question, string role)
    {
        if (role is not ("coach" or "member") || !IsNavigationQuestion(question)) return null;
        var q = Normalize(question);
        if (role == "coach" && (new[] { "tao lich hoc", "them buoi hoc", "create schedule", "add session", "tao lop hoc", "new class" }.Any(x => Includes(q, x))
            || ((Includes(q, "tao") || Includes(q, "them") || Includes(q, "create") || Includes(q, "add"))
                && (Includes(q, "lich") || Includes(q, "buoi hoc") || Includes(q, "teaching session")))))
            return Regex.IsMatch(question, @"[À-ỹà-ỹđĐ]") || Includes(q,"tao lich hoc") || Includes(q,"them buoi hoc")
                ? "Coach không có quyền tạo lớp hoặc buổi học mới. Vào Schedule để xem lịch được phân công; liên hệ Center Manager khi cần đổi lịch. Request chỉ dùng để báo vắng."
                : "Coaches cannot create classes or teaching sessions. Open Schedule to view assignments. Contact a Center Manager for changes.";

        if (role == "coach" && (Includes(q, "request") || Includes(q, "yeu cau")))
            return "Vào Request (/coach/support). Tab Absence requests để xem yêu cầu vắng; để gửi mới, vào Schedule, chọn buổi dạy đủ điều kiện. Tab Member support để xử lý yêu cầu được phân công, không tạo request mới tại đây. Các trạng thái hiển thị: Not started, In progress, Done, Overdue (quá hạn SLA).";

        // A verified Coach workflow from teaching-editor.tsx and coach-class-page.tsx.
        if (role == "coach" && new[] { "plan", "giao an", "ke hoach tap", "lesson plan" }.Any(x => Includes(q, x)))
        {
            var vi = Regex.IsMatch(question, @"[À-ỹà-ỹđĐ]") || new[] { "o dau", "tao", "nut", "cach", "huong dan", "giao an" }.Any(x => Includes(q,x));
            return vi
                ? "1. Vào Classes (/coach/classes).\n2. Chọn lớp được phân công.\n3. Mở Plans.\n4. Mở Lesson plan, chọn Session hoặc Personal plan và học viên/buổi phù hợp.\n5. Có thể mở AI lesson suggestions, nhập Training goal và Experience rồi nhấn Generate suggestion.\n6. Kiểm tra bản nháp, nhấn Use this suggestion nếu phù hợp, sau đó Save to SportHub. AI không tự lưu giáo án."
                : "1. Open Classes (/coach/classes).\n2. Select your assigned class.\n3. Open Plans.\n4. Open the lesson-plan editor, choose Session or Personal plan, and select the eligible session/student.\n5. Optionally open AI lesson suggestions, enter Training goal and Experience, then Generate suggestion.\n6. Review, apply and Save to SportHub. The AI draft is not saved automatically.";
        }

        if (new[] { "tai khoan", "account", "doi mat khau", "password" }.Any(x => Includes(q, x)))
            return "Open your profile menu, then Account (/account). Use the controls actually available to your signed-in account.";

        // Never fabricate page-to-button paths from route existence alone.
        var best = Catalog.RootElement.GetProperty("routes").EnumerateArray()
            .Where(x => x.GetProperty("role").GetString() == role && x.GetProperty("verified").GetString() == "route_exists")
            .Select(x => new { Route = x.GetProperty("route").GetString() ?? "", Title = x.GetProperty("title").GetString() ?? "" })
            .Where(x => x.Title.Length >= 5 && Includes(q, Normalize(x.Title)))
            .OrderByDescending(x => x.Title.Length).FirstOrDefault();
        return best is null ? null : $"The {best.Title} page exists at {best.Route}. I cannot verify a specific button or action from the route alone.";
    }

    internal static string NavigationFallback(string question, string role) =>
        role is "coach" or "member"
            ? "This is a SportHub navigation question, but the exact button and steps have not been verified in current source. Please refer to the visible UI or specify the page and function. I will not invent a control."
            : "Navigation support is restricted to authenticated Member and Coach accounts.";
}
