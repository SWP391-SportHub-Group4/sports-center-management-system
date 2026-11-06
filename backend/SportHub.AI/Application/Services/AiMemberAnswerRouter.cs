using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services;

// Member-only answers. Never invokes Coach business handlers.
internal static class AiMemberAnswerRouter
{
    private static string Normalize(string value)
    {
        var b = new StringBuilder();
        foreach (var ch in (value ?? string.Empty).Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                b.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        return Regex.Replace(b.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }
    private static bool Any(string q, params string[] phrases)
    {
        var padded = " " + q + " ";
        return phrases.Any(p => padded.Contains(" " + p + " ", StringComparison.Ordinal));
    }

    internal static async Task<string?> TryAnswerAsync(ISportHubDbContext db, Guid memberId,
        string question, CancellationToken ct)
    {
        var q = Normalize(question);
        var navigation = Any(q, "o dau", "nut", "huong dan", "cach", "lam sao", "where", "how");
        if (navigation && Any(q, "ghi danh", "dang ky lop", "dang ky khoa hoc", "register", "enroll"))
            return "Vào Services → Explore packages → Class, chọn lớp muốn học → xem chi tiết → Register for this course. Hệ thống yêu cầu hoàn tất checkout theo điều kiện của lớp. Wolf không tự đăng ký hoặc thanh toán.";
        if (navigation && Any(q, "membership", "goi tap", "mua goi", "chon goi", "package"))
            return "Vào Services → Explore packages, chọn loại dịch vụ hoặc gói phù hợp, nhấn Select và kiểm tra chi tiết trước khi thanh toán.";
        if (navigation && Any(q, "avatar", "anh dai dien"))
            return "Mở menu tài khoản → Account → Personal Information → Browse → chọn ảnh và lưu theo các nút hiển thị.";
        if (Any(q, "mon the thao", "sports", "sport") && Any(q, "bao nhieu", "mon nao", "co nhung mon", "nhung mon", "danh sach", "how many", "which"))
        {
            var names = await db.Set<Sport>().AsNoTracking().Where(s => s.IsActive)
                .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
                .Select(s => s.Name).Take(101).ToListAsync(ct);
            return names.Count == 0 ? "Danh mục hiện không trả về môn thể thao đang hoạt động." :
                $"Có {names.Count}{(names.Count > 100 ? "+" : "")} môn thể thao đang hoạt động" +
                ": " + string.Join(", ", names.Take(100)) + (names.Count > 100 ? ". Danh sách được giới hạn ở 100 môn." : ".");
        }
        if (Any(q, "bao nhieu lop", "so lop", "how many classes", "how many courses") &&
            Any(q, "dang mo", "hien co", "trung tam", "open", "ghi danh", "dang ky"))
        {
            var count = await db.Set<Class>().AsNoTracking()
                .CountAsync(c => c.Status == ClassStatus.Published && c.EnrollmentOpen, ct);
            return $"Hiện có {count} lớp Published đang mở ghi danh, theo dữ liệu hệ thống tại thời điểm truy vấn. Xem Services → Class để biết lớp còn chỗ hay không.";
        }
        return null;
    }
}
