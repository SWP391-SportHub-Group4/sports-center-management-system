using System.Diagnostics;
using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member-specific source of truth for *my enrollment*, never public course catalog.
/// Call before v16, Overview v15 and Member Data Hub routing.
/// Verified only for the logged-in Member. No SQL generation or writes.
/// </summary>
internal static class MemberEnrollmentAnswersV17
{
    private static string Normalize(string raw)
    {
        var b = new StringBuilder();
        foreach (var c in (raw ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                b.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return b.ToString().Normalize(NormalizationForm.FormC);
    }

    private static bool Has(string q, params string[] terms) =>
        terms.Any(term => q.Contains(term, StringComparison.Ordinal));

    internal static bool IsOwnEnrollmentQuestion(string question)
    {
        var q = Normalize(question);
        if (!Has(q, "lop", "class", "course", "ghi danh", "enroll")) return false;
        // Discovery, purchase, public availability and directions must not be confused with my enrollment.
        if (Has(q, "co the tham gia", "co the dang ky", "lop dang mo", "lop nao con cho",
            "lop goi y", "recommended", "gia bao nhieu", "hoc phi", "mua", "register now",
            "how to", "o dau", "cach dang ky", "cach tham gia", "join a class", "available classes")) return false;
        return Has(q, "toi", "cua toi", "minh", "da dang ky", "da ghi danh", "dang hoc",
            "da tham gia", "enrolled", "my class", "my course", "i joined", "i am taking", "am i in");
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid authenticatedUserId, string question,
        CancellationToken ct)
    {
        if (authenticatedUserId == Guid.Empty || !IsOwnEnrollmentQuestion(question)) return null;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(12));
        ct = timeout.Token;
        var isMember = await db.Set<UserAccount>().AsNoTracking().AnyAsync(
            u => u.UserId == authenticatedUserId && u.Role != null && u.Role.RoleName == UserRole.Member, ct);
        if (!isMember) return null;

        var stopwatch = Stopwatch.StartNew();
        var q = Normalize(question);
        var isCurrentlyLearning = Has(q, "dang hoc", "dang tham gia", "currently taking", "currently attending");
        var rows = db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == authenticatedUserId);
        var confirmedTotal = await rows.CountAsync(e => e.Status == EnrollmentStatus.Confirmed, ct);
        var activeTotal = await rows.CountAsync(e => e.Status == EnrollmentStatus.Confirmed &&
            e.Class != null && e.Class.Status == ClassStatus.InProgress, ct);
        var list = await rows.Where(e => e.Status == EnrollmentStatus.Confirmed)
            .OrderByDescending(e => e.EnrolledAt).Take(40)
            .Select(e => new {
                e.EnrolledAt,
                Name = e.Class != null ? e.Class.Name : "",
                Code = e.Class != null ? e.Class.Code : "",
                Start = e.Class != null ? (DateOnly?)e.Class.StartDate : null,
                ClassStatus = e.Class != null ? (ClassStatus?)e.Class.Status : null
            }).ToListAsync(ct);

        string answer;
        if (confirmedTotal == 0)
            answer = "Tài khoản Member đang đăng nhập không có ghi danh lớp nào ở trạng thái Confirmed. " +
                "Các lớp trong Recommended for you hoặc danh mục mở bán KHÔNG phải lớp bạn đã đăng ký.";
        else
        {
            var sb = new StringBuilder();
            if (isCurrentlyLearning)
                sb.Append($"Hiện tại bạn có {activeTotal} lớp ở trạng thái InProgress và {confirmedTotal} ghi danh Confirmed. ");
            else
                sb.Append($"Bạn có {confirmedTotal} ghi danh lớp Confirmed. ");
            sb.AppendLine("Danh sách lớp bạn đã ghi danh (không phải lớp đang mở bán):");
            for (var i = 0; i < list.Count; i++)
            {
                var e = list[i];
                sb.Append(i + 1).Append(". ").Append(e.Name).Append(" (").Append(e.Code).Append(")")
                  .Append(" · trạng thái ").Append(e.ClassStatus?.ToString() ?? "unknown")
                  .Append(" · khai giảng ").Append(e.Start?.ToString("dd/MM/yyyy") ?? "chưa có")
                  .AppendLine();
            }
            if (activeTotal == 0 && isCurrentlyLearning)
                sb.AppendLine("Chưa có lớp nào ở trạng thái InProgress; lớp đã ghi danh có thể chưa khai giảng hoặc đã kết thúc.");
            if (confirmedTotal > list.Count)
                sb.AppendLine($"Hiển thị {list.Count}/{confirmedTotal} ghi danh, không kết luận về phần chưa tải.");
            sb.Append("Confirmed nghĩa là đã ghi danh, không đồng nghĩa đã điểm danh tham dự buổi học.");
            answer = sb.ToString();
        }
        stopwatch.Stop();
        return new AiChatResponse(Guid.Empty, "member-enrollment-v17", question, answer,
            "member-verified", "backend-read-only", "member-enrollment-v17",
            (int)Math.Min(int.MaxValue, stopwatch.ElapsedMilliseconds), clock.UtcNow);
    }
}
