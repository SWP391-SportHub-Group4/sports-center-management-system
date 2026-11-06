using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Application.Services;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Coach-only, read-only numeric student profile comparisons.
/// Authorization is based on CURRENT confirmed enrolments in directly assigned classes.
/// This class does not touch AI Plan, Member Chat, or provider prompts.
/// </summary>
internal static class CoachStudentMetricAnalysis
{
    private const int MaxAuthorizedStudents = 250;
    private const int MaxListedStudents = 25;

    private enum Metric { Bmi, Weight, Height, TrainingDays }

    private sealed record Student(Guid Id, string Name, decimal? HeightCm,
        decimal? WeightKg, int? TrainingDays, bool HasProfile);
    private sealed record Ranked(Student Student, decimal Value);

    private static string N(string? input)
    {
        var decomposed = (input ?? string.Empty).Normalize(NormalizationForm.FormD);
        var result = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                result.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return Regex.Replace(result.ToString().Normalize(NormalizationForm.FormC), "[^a-z0-9]+", " ").Trim();
    }

    private static bool Has(string q, params string[] terms) => terms.Any(q.Contains);
    private static bool IsNavigation(string q) =>
        Has(q, "o dau", "vao dau", "nut nao", "tab nao", "where", "how to open", "cach xem o dau");
    private static Metric? IdentifyMetric(string q)
    {
        if (Has(q, "bmi", "chi so khoi co the", "body mass index")) return Metric.Bmi;
        if (Has(q, "can nang", "weight", "nang nhat", "nhe nhat")) return Metric.Weight;
        if (Has(q, "chieu cao", "height", "cao nhat ve chieu cao")) return Metric.Height;
        if (Has(q, "so ngay tap", "tan suat tap", "training days", "days per week")) return Metric.TrainingDays;
        return null;
    }

    internal static bool IsMetricQuestion(string question)
    {
        var q = N(question);
        return !IsNavigation(q) && IdentifyMetric(q) is not null &&
            (Has(q, "student", "hoc vien", "member", "nguoi hoc", "3 nguoi", "ba nguoi",
                "cac ban", "toan bo", "tat ca", "nhat", "trung binh", "average", "so sanh",
                "compare", "xep hang", "danh sach", "cua", "profile", "fitness", "chi so") || q == "bmi");
    }

    internal static async Task<string> AnswerAsync(ISportHubDbContext db, Guid coachId,
        string question, CancellationToken ct)
    {
        var q = N(question);
        var vi = Regex.IsMatch(question, "[À-ỹà-ỹđĐ]") ||
            Has(q, "hoc vien", "chi so", "can nang", "chieu cao", "toan bo", "cao nhat", "thap nhat", "trung binh");
        var metric = IdentifyMetric(q);
        if (metric is null) return vi ? "Vui lòng nêu chỉ số muốn so sánh." : "Specify the measurement to compare.";

        // Class filters are resolved from the currently assigned class list, never user-supplied IDs.
        var assignedClasses = await CoachDataScope.Classes(db, coachId)
            .Select(c => new { c.ClassId, c.Code, c.Name })
            .ToListAsync(ct);
        if (assignedClasses.Count == 0)
            return vi ? "Không tìm thấy lớp được phân công hợp lệ để đối chiếu học viên."
                      : "No authorized assigned classes were found.";

        var mentionedClasses = assignedClasses.Where(c =>
            (!string.IsNullOrWhiteSpace(c.Code) && Regex.IsMatch(" " + q + " ", @"\b" + Regex.Escape(N(c.Code)) + @"\b")) ||
            (!string.IsNullOrWhiteSpace(c.Name) && q.Contains(N(c.Name), StringComparison.Ordinal)))
            .ToList();
        if (mentionedClasses.Count > 1)
            return vi ? "Có nhiều lớp khớp tên. Vui lòng chỉ rõ một mã lớp."
                      : "Multiple classes match. Specify one class code.";

        var enrollments = CoachDataScope.Enrollments(db, coachId);
        if (mentionedClasses.Count == 1)
        {
            var selectedClassId = mentionedClasses[0].ClassId;
            enrollments = enrollments.Where(e => e.ClassId == selectedClassId);
        }
        var authorizedIds = enrollments.Select(e => e.MemberId).Distinct();
        var totalAuthorized = await authorizedIds.CountAsync(ct);
        if (totalAuthorized == 0)
            return vi ? "Không tìm thấy học viên đang ghi danh hợp lệ trong phạm vi lớp được chọn."
                      : "No currently authorized enrolled students were found in this scope.";
        if (totalAuthorized > MaxAuthorizedStudents)
            return vi ? "Phạm vi có quá nhiều học viên để phân tích an toàn. Vui lòng chỉ rõ một lớp."
                      : "Too many students in scope. Specify one assigned class.";

        // Use the exact authorized member IDs as the filter for BOTH names and fitness measurements.
        var students = await db.Set<UserAccount>().AsNoTracking()
            .Where(u => authorizedIds.Contains(u.UserId))
            .Select(u => new { u.UserId, u.Email, Name = u.Profile != null ? u.Profile.FullName : null })
            .ToListAsync(ct);
        var profiles = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .Where(p => authorizedIds.Contains(p.MemberId))
            .Select(p => new { p.MemberId, p.HeightCm, p.WeightKg, p.TrainingDaysPerWeek })
            .ToListAsync(ct);
        var profileById = profiles.ToDictionary(p => p.MemberId);
        var roster = students.Select(u =>
        {
            var found = profileById.TryGetValue(u.UserId, out var profile);
            return new Student(u.UserId,
                !string.IsNullOrWhiteSpace(u.Name) ? u.Name! : "Unnamed student",
                found ? profile!.HeightCm : null,
                found ? profile!.WeightKg : null,
                found ? profile!.TrainingDaysPerWeek : null, found);
        }).OrderBy(s => s.Name).ToList();

        // A named student gets an individual answer; multiple matches must never be guessed.
        var named = roster.Where(s => s.Name != "Unnamed student" &&
            q.Contains(N(s.Name), StringComparison.Ordinal)).ToList();
        if (named.Count > 1)
            return vi ? "Có nhiều học viên khớp câu hỏi. Vui lòng chỉ rõ một người."
                      : "Multiple students match; specify one student.";
        if (named.Count == 1)
            roster = named;

        // Do not silently interpret "the three above" as arbitrary three when scope contains more.
        if (named.Count == 0 && Has(q, "3 student", "3 hoc vien", "ba hoc vien", "3 nguoi", "ba nguoi") && roster.Count != 3)
            return vi ? $"Hiện phạm vi có {roster.Count} học viên. Hãy nêu lớp hoặc tên ba học viên bạn muốn so sánh."
                      : $"There are {roster.Count} students in the current scope. Specify a class or the three students by name.";

        decimal? Value(Student s) => metric.Value switch
        {
            Metric.Bmi when s.HeightCm is >= 80 and <= 240 && s.WeightKg is >= 15 and <= 400 =>
                Math.Round(s.WeightKg!.Value / ((s.HeightCm!.Value / 100m) * (s.HeightCm.Value / 100m)),
                    1, MidpointRounding.AwayFromZero),
            Metric.Weight when s.WeightKg is > 0 => s.WeightKg,
            Metric.Height when s.HeightCm is > 0 => s.HeightCm,
            Metric.TrainingDays when s.TrainingDays is >= 0 and <= 7 => s.TrainingDays.Value,
            _ => null
        };
        var ranked = roster.Select(s => new { Student = s, Value = Value(s) })
            .Where(x => x.Value.HasValue)
            .Select(x => new Ranked(x.Student, x.Value!.Value))
            .ToList();
        var label = metric.Value switch
        {
            Metric.Bmi => "BMI", Metric.Weight => vi ? "cân nặng" : "weight",
            Metric.Height => vi ? "chiều cao" : "height",
            _ => vi ? "số ngày tập/tuần" : "training days/week"
        };
        var unit = metric.Value switch { Metric.Weight => " kg", Metric.Height => " cm",
            Metric.TrainingDays => " ngày/tuần", _ => string.Empty };
        string F(Ranked r) => $"{r.Student.Name}: {r.Value.ToString("0.#", CultureInfo.InvariantCulture)}{unit}";
        var valid = ranked.Count;
        var missing = roster.Count - valid;
        if (valid == 0)
            return vi ? $"Có {roster.Count} học viên trong phạm vi này nhưng chưa có đủ số liệu hợp lệ để tính {label}."
                      : $"There are {roster.Count} students, but no valid measurements for {label}.";

        var highest = Has(q, "cao nhat", "lon nhat", "nhieu nhat", "max", "highest", "biggest", "nang nhat");
        var lowest = Has(q, "thap nhat", "nho nhat", "it nhat", "min", "lowest", "smallest", "nhe nhat");
        var average = Has(q, "trung binh", "binh quan", "average", "mean");
        var desc = ranked.OrderByDescending(x => x.Value).ThenBy(x => x.Student.Name).ToList();
        var asc = ranked.OrderBy(x => x.Value).ThenBy(x => x.Student.Name).ToList();
        var scope = mentionedClasses.Count == 1 ? mentionedClasses[0].Name :
            (vi ? "các lớp được phân công" : "assigned classes");
        var completeness = missing > 0
            ? (vi ? $" Lưu ý: {missing} học viên thiếu số liệu hợp lệ và không được đưa vào phép tính."
                  : $" Note: {missing} student(s) lack valid measurements and were excluded.")
            : string.Empty;

        if (highest || lowest)
        {
            var arr = highest ? desc : asc;
            var value = arr[0].Value;
            var leaders = arr.Where(x => x.Value == value).ToList();
            return vi
                ? $"Trong {scope}, {string.Join(", ", leaders.Select(x => x.Student.Name))} có {label} {(highest ? "cao nhất" : "thấp nhất")}: {value.ToString("0.#", CultureInfo.InvariantCulture)}{unit}. Đã đối chiếu {valid}/{roster.Count} học viên có dữ liệu hợp lệ.{completeness} Dữ liệu thể chất do hội viên tự khai."
                : $"In {scope}, {string.Join(", ", leaders.Select(x => x.Student.Name))} {(highest ? "has the highest" : "has the lowest")} {label}: {value.ToString("0.#", CultureInfo.InvariantCulture)}{unit}. Based on {valid}/{roster.Count} students with valid measurements.{completeness} Measurements are self-reported.";
        }
        if (average)
        {
            var mean = Math.Round(ranked.Average(x => x.Value), 1, MidpointRounding.AwayFromZero);
            return vi ? $"{label} trung bình của {valid} học viên có số liệu trong {scope} là {mean.ToString("0.#", CultureInfo.InvariantCulture)}{unit}.{completeness}"
                      : $"Mean {label} across {valid} students in {scope}: {mean.ToString("0.#", CultureInfo.InvariantCulture)}{unit}.{completeness}";
        }
        if (ranked.Count > MaxListedStudents)
            return vi ? $"Có {ranked.Count} học viên có số liệu {label}. Vui lòng chỉ rõ lớp hoặc học viên để xem danh sách chi tiết; tôi không xuất hàng loạt hồ sơ lớn."
                      : $"{ranked.Count} students have {label} measurements. Specify a class or student for a detailed list.";
        return (vi ? $"{label} của {ranked.Count} học viên trong {scope}:\n" : $"{label} for {ranked.Count} students in {scope}:\n") +
            string.Join("\n", desc.Select((r, i) => $"{i + 1}. {F(r)}")) +
            completeness + (vi ? "\nSố liệu do hội viên tự khai; BMI không phải chẩn đoán y tế." :
                "\nSelf-reported measurements; BMI is not a medical diagnosis.");
    }
}
