using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Verified Coach-only UI instructions for Classes and Students.
/// Uses labels/routes checked against the Coach frontend, not database snapshots.
/// Never called by AI Plan or the Member assistant.
/// </summary>
internal static class CoachClassesStudentsNavigation
{
    private static string Normalize(string text)
    {
        var source = (text ?? string.Empty).Normalize(NormalizationForm.FormD);
        var result = new StringBuilder(source.Length);
        foreach (var character in source)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                continue;
            result.Append(character is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(character));
        }
        return Regex.Replace(result.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }

    private static bool Has(string question, params string[] phrases) =>
        phrases.Any(phrase => (" " + question + " ").Contains(" " + phrase + " ", StringComparison.Ordinal));

    private static bool IsVietnamese(string original, string q) =>
        Regex.IsMatch(original, @"[À-ỹà-ỹđĐ]") ||
        Has(q, "xem", "o dau", "cach", "hoc vien", "lop", "thong tin", "chi tiet", "tim", "bao nhieu", "dang day", "nut", "mo", "ho so");

    /// <summary>
    /// Returns null for actual data questions (numbers, names, fees, class facts, health measurements)
    /// so the authorized Coach Data Tools, not static UI instructions, answer them.
    /// </summary>
    internal static string? TryAnswer(string question)
    {
        var q = Normalize(question);
        if (q.Length == 0) return null;
        bool vi = IsVietnamese(question, q);
        bool how = Has(q, "o dau", "cach", "lam sao", "huong dan", "nut", "thao tac", "where", "how", "open", "view", "find", "access", "tim", "xem", "mo");
        bool dataQuestion = Has(q, "bao nhieu", "may", "how many", "who", "ai", "ten", "names", "cost", "gia", "hoc phi", "cho trong", "capacity", "seat", "seats", "bmi", "can nang", "chieu cao", "height", "weight", "profile cua", "so luong", "status cua");
        // For data questions never substitute generic directions for a real answer.
        // Exception: explicit button/location queries containing a data word.
        bool explicitUi = Has(q, "o dau", "nut", "thao tac", "huong dan", "where", "how to", "cach xem", "cach mo", "lam sao");
        if (dataQuestion && !explicitUi) return null;

        bool aboutStudent = Has(q, "student", "students", "hoc vien", "member", "members", "student directory", "danh sach hoc vien", "ho so hoc vien");
        bool aboutClass = Has(q, "class", "classes", "lop", "khoa hoc", "course", "class detail", "class details", "details classes", "chi tiet lop");
        bool classNotice = Has(q, "notice", "notices", "class notice", "class notices", "thong bao lop", "gui thong bao", "nhac nho");
        bool classPlan = Has(q, "plan", "plans", "giao an", "lesson plan", "teaching plan", "soan bai", "ke hoach day", "ke hoach tap");
        bool studentProfile = Has(q, "view profile", "student profile", "student details", "thong tin student", "thong tin hoc vien", "ho so hoc vien", "xem profile hoc vien", "fitness profile", "health profile", "ho so suc khoe", "the luc", "danh gia", "assessment", "assessments");
        bool studentsNavigation = (aboutStudent && how) || (studentProfile && how);
        bool classesNavigation = (aboutClass && how) || (classNotice && how) || (classPlan && how);

        // Student-facing UI always precedes generic class navigation.
        if (studentsNavigation)
        {
            if (Has(q, "assessment", "assessments", "danh gia"))
                return vi ? "Vào Students (/coach/members) → tìm học viên theo Name or email, có thể lọc Sport → View profile → tab Assessments để xem các đánh giá được phép truy cập."
                          : "Open Students (/coach/members) → search by Name or email (optionally filter Sport) → View profile → Assessments.";
            if (Has(q, "health profile", "fitness profile", "ho so suc khoe", "the luc", "chi so", "bmi"))
                return vi ? "Vào Students (/coach/members) → tìm học viên trong danh sách được phân công → View profile → Health profile. Chỉ xem hồ sơ học viên mà tài khoản Coach có quyền truy cập."
                          : "Open Students (/coach/members) → find an assigned student → View profile → Health profile. Access is restricted to authorized students.";
            if (Has(q, "plans", "plan", "ke hoach", "giao an"))
                return vi ? "Vào Students (/coach/members) → chọn View profile của học viên → tab Plans. Bạn chỉ xem hoặc xử lý kế hoạch theo quyền và thao tác giao diện hiện có."
                          : "Open Students (/coach/members) → View profile for the student → Plans.";
            return vi ? "Để xem thông tin học viên: mở Students trên thanh điều hướng Coach (/coach/members) → tìm trong ô Name or email hoặc lọc Sport → chọn View profile ở hàng học viên → chọn Health profile, Plans hoặc Assessments."
                      : "Open Students (/coach/members) → search Name or email or filter Sport → select View profile for the student → Health profile, Plans, or Assessments.";
        }

        if (classesNavigation)
        {
            if (classNotice)
                return vi ? "Vào Classes (/coach/classes) → tìm tên hoặc mã lớp → Open class → tab Notices → mục Class notices → Send notice để soạn thông báo cho cả lớp hoặc học viên được phép chọn."
                          : "Open Classes (/coach/classes) → search for the class → Open class → Notices → Class notices → Send notice.";
            if (classPlan)
                return vi ? "Để vào phần giáo án: Classes (/coach/classes) → chọn Open class ở đúng lớp → tab Plans → chọn buổi/giáo án phù hợp. Nếu có AI lesson suggestions, nhập Training goal, Generate suggestion, xem lại rồi mới Use this suggestion và lưu theo giao diện."
                          : "Open Classes (/coach/classes) → Open class → Plans → select the eligible lesson/plan. For AI suggestions, review the generated content before applying and saving.";
            if (Has(q, "tim", "search", "loc", "filter"))
                return vi ? "Vào Classes (/coach/classes) → dùng ô Search class, code or sport → nhập tên lớp, mã lớp hoặc môn → chọn Open class tại kết quả phù hợp."
                          : "Open Classes (/coach/classes) → Search class, code or sport → Open class on the matching card.";
            return vi ? "Để xem chi tiết lớp: chọn Classes trên thanh điều hướng Coach (/coach/classes) → tìm đúng tên hoặc mã lớp trong Search class, code or sport → bấm Open class trên thẻ lớp. Trang chi tiết hiển thị Court / room, Start date, Class size, Available seats, Course fee, Registration cùng các tab Students, Plans và Notices."
                      : "Open Classes (/coach/classes) → Search class, code or sport → Open class. Class details show Court / room, Start date, Class size, Available seats, Course fee, Registration, plus Students, Plans and Notices.";
        }
        return null;
    }
}
