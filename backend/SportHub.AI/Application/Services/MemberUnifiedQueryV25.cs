using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Domain.Constants;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.AI.Application.Services;

/// <summary>
/// MEMBER_UNIFIED_V25: a single authenticated, bounded, read-only query entry point.
/// Precise numerical answers use EF Core, not an LLM. Comparative/explanatory
/// questions use the published Member prompt plus scoped evidence; legacy handlers
/// handle unrelated topics. Never routes to Coach, AI Plan or Workout Suggestions.
/// </summary>
internal static class MemberUnifiedQueryV25
{
    private enum Intent { None, ClassPricing, GymCatalog, RentalDuration, RentalCatalog }

    private static string Normalize(string raw)
    {
        var sb = new StringBuilder();
        foreach (var c in (raw ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    private static bool Has(string text, params string[] patterns) =>
        patterns.Any(p => text.Contains(p, StringComparison.Ordinal));

    private static Intent Classify(string question)
    {
        var q = Normalize(question);
        var classTerm = Has(q, "lop", "class", "khoa hoc", "course");
        var price = Has(q, "gia", "hoc phi", "dat nhat", "mac nhat", "re nhat", "cao nhat", "thap nhat", "price", "expensive", "cheapest", "so sanh", "compare");
        if (classTerm && price && !Has(q, "lop cua toi", "lop toi dang hoc", "my enrolled"))
            return Intent.ClassPricing;
        var rental = Has(q, "thue san", "dat san", "court rental", "rent a court", "rent court");
        if (rental && Has(q, "bao nhieu tieng", "may tieng", "toi da", "toi thieu", "bao nhieu gio", "how many hours", "max hours", "duration"))
            return Intent.RentalDuration;
        if (rental && Has(q, "mon nao", "nhung mon", "co the", "san nao", "loai san", "danh sach", "available sports"))
            return Intent.RentalCatalog;
        if (Has(q, "goi gym", "goi tap", "gym package", "gym membership", "gym plan", "membership package") &&
            Has(q, "trung tam", "dang ban", "co bao nhieu", "bao nhieu goi", "tat ca", "danh sach", "loai nao", "gia", "so sanh", "mac nhat", "re nhat", "packages", "plans"))
            return Intent.GymCatalog;
        return Intent.None;
    }

    internal static string ClassifyForTests(string question) => Classify(question).ToString();

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid authenticatedMemberId, string question,
        IAiChatProvider provider, ISystemPromptReader prompts, CancellationToken ct)
    {
        var intent = Classify(question);
        if (intent == Intent.None || authenticatedMemberId == Guid.Empty) return null;
        var authorized = await db.Set<UserAccount>().AsNoTracking().AnyAsync(u =>
            u.UserId == authenticatedMemberId && u.Role != null &&
            u.Role.RoleName == UserRole.Member, ct);
        if (!authorized) return null;
        var timer = Stopwatch.StartNew();
        var q = Normalize(question);
        string answer;
        string? model = null;
        string? providerName = null;
        string? promptVersion = null;
        var interactionId = "member-unified-v25-" + Guid.NewGuid().ToString("N");

        if (intent == Intent.ClassPricing)
        {
            // EXACT population: published or in-progress courses accepting enrollment.
            // Never replace the center's catalog with this member's own enrollments.
            var query = db.Set<SportHub.Scheduling.Domain.Entities.Class>().AsNoTracking()
                .Where(c => c.EnrollmentOpen &&
                    (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress));
            var count = await query.CountAsync(ct);
            if (count == 0)
                answer = "Hiện không có lớp nào đang mở ghi danh trong danh mục để so sánh giá.";
            else
            {
                var descending = !Has(q, "re nhat", "thap nhat", "cheapest", "lowest", "least expensive");
                var topPrice = descending ? await query.MaxAsync(c => c.Price, ct) : await query.MinAsync(c => c.Price, ct);
                var leaders = await query.Where(c => c.Price == topPrice)
                    .OrderBy(c => c.Name).Take(30)
                    .Select(c => new { c.Name, c.Code, c.Price, c.StartDate,
                        sport = c.Sport != null ? c.Sport.Name : null }).ToListAsync(ct);
                var ties = await query.CountAsync(c => c.Price == topPrice, ct);
                var ranking = descending ? "giá cao nhất" : "giá thấp nhất";
                if (Has(q, "so sanh", "compare", "phan tich", "vi sao", "analysis"))
                {
                    // The LLM receives *verified* highest/lowest facts, not a random sample.
                    var evidence = JsonSerializer.Serialize(new {
                        scope = "center classes open for enrollment", totalClasses = count,
                        verifiedExtreme = ranking, extremePriceVnd = topPrice, ties,
                        leaders, leadersTruncated = ties > leaders.Count,
                        note = "Prices are full-course prices. Never use this member's enrollment list as the full catalog." });
                    var published = await prompts.GetPublishedAsync("Member", ct);
                    var ai = await provider.AskAsync(published.Content + "\nUse only verified facts in the provided evidence. " +
                        "Explain the ranking; never invent class prices, missing records or personal enrollment. " +
                        "Answer in the user's language.", evidence, question, null, ct);
                    answer = AiPlainTextSanitizer.Clean(ai.Answer);
                    if (string.IsNullOrWhiteSpace(answer)) throw new InvalidOperationException("Member catalog AI response was empty.");
                    model = ai.Model; providerName = ai.Provider; promptVersion = published.Version;
                    interactionId = ai.InteractionId;
                }
                else
                {
                    answer = $"Trong {count} lớp đang mở ghi danh, mức {ranking} là {topPrice:N0} VND/khóa. " +
                        $"Có {ties} lớp cùng mức giá:\n" +
                        string.Join("\n", leaders.Select(c => $"- {c.Name} ({c.Code}), {c.sport ?? "không rõ môn"}, bắt đầu {c.StartDate:dd/MM/yyyy}.")) +
                        (ties > leaders.Count ? $"\nChỉ hiển thị {leaders.Count}/{ties} lớp đồng giá." : "") +
                        "\nĐây là danh mục lớp trung tâm đang mở đăng ký, không phải các lớp bạn đã tham gia.";
                }
            }
        }
        else if (intent == Intent.RentalDuration)
        {
            // Verified from CourtRentalCalendarService: hours >= 1 and <= configured max and <= 4.
            // Actual maximum can be LOWER depending on current Center settings.
            answer = "Trên giao diện Court rental, mỗi lượt có thể chọn từ 1 đến tối đa 4 giờ liên tiếp. " +
                "Giới hạn thực tế còn phụ thuộc cấu hình hiện hành và các slot liên tiếp còn trống. " +
                "Vào Services → Explore packages → Court rental → Select để chọn ngày, sân và khung giờ; " +
                "giá phụ thuộc sân và slot nên phải xem báo giá tại bước đặt sân.";
        }
        else if (intent == Intent.GymCatalog)
        {
            var query = db.Set<MembershipPackage>().AsNoTracking().Where(p => p.IsActive);
            var count = await query.CountAsync(ct);
            var list = await query.OrderBy(p => p.Price).ThenBy(p => p.Name).Take(60)
                .Select(p => new { p.Name, p.Price, p.OriginalPrice, p.DurationDays, p.Description }).ToListAsync(ct);
            answer = $"Trung tâm hiện có {count} gói Gym đang hoạt động trong danh mục:\n" +
                string.Join("\n", list.Select(p => $"- {p.Name}: {p.Price:N0} VND, thời hạn {p.DurationDays} ngày.")) +
                (count > list.Count ? $"\nChỉ hiển thị {list.Count}/{count} gói." : "") +
                "\nĐây là danh mục Explore packages, không phải gói bạn đang sở hữu.";
        }
        else
        {
            var offeringIds = await db.Set<SportServiceOffering>().AsNoTracking()
                .Where(x => x.IsEnabled && x.ServiceType == SportServiceType.CourtRental)
                .Select(x => x.SportId).Distinct().ToListAsync(ct);
            var sports = await db.Set<Sport>().AsNoTracking()
                .Where(s => s.IsActive && offeringIds.Contains(s.SportId))
                .OrderBy(s => s.Name).Select(s => new { s.SportId, s.Name }).ToListAsync(ct);
            var availableRooms = await db.Set<Room>().AsNoTracking()
                .Where(r => r.IsActive && r.AllowRental).CountAsync(ct);
            answer = "Các môn có dịch vụ Court Rental đang bật: " +
                (sports.Count == 0 ? "chưa có môn nào được bật." : string.Join(", ", sports.Select(s => s.Name))) +
                $" Có {availableRooms} phòng/sân được cấu hình cho phép thuê trong trung tâm. " +
                "Việc một môn được bật không đảm bảo đang có sân phù hợp hoặc slot trống. " +
                "Muốn xác nhận chính xác, chọn Services → Explore packages → Court rental → Select và kiểm tra lịch/giá của từng sân.";
        }

        timer.Stop();
        // Persist only metadata and redacted output, not the data supplied to Gemini.
        var logId = Guid.NewGuid();
        db.Set<AiLog>().Add(new AiLog {
            LogId = logId, UserId = authenticatedMemberId, QueryType = AiQueryTypes.Chat,
            InputPayload = JsonSerializer.Serialize(new { question, intent = intent.ToString(), version = "member-v25" }),
            ResponsePayload = JsonSerializer.Serialize(new { answer = "[REDACTED]", success = true,
                provider = providerName ?? "verified-data" }),
            ResponseTimeMs = (int)Math.Min(int.MaxValue, timer.ElapsedMilliseconds), CreatedAt = clock.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return new AiChatResponse(logId, interactionId, question, answer,
            providerName ?? "verified-data", model ?? "member-query-v25",
            promptVersion ?? "member-query-v25", (int)Math.Min(int.MaxValue, timer.ElapsedMilliseconds), clock.UtcNow);
    }
}
