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

namespace SportHub.AI.Application.Services;

/// <summary>
/// MEMBER_V23: disambiguates OWNED vs PUBLIC services before older shortcut handlers.
/// Uses the authenticated Member ID for ownership, never a user ID from model output.
/// Public catalog / allowed rentable-room lists are not live booking availability.
/// </summary>
internal static class MemberServiceCatalogV23
{
    private static string N(string raw)
    {
        var sb = new StringBuilder();
        foreach (var c in (raw ?? string.Empty).Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
    private static bool H(string q, params string[] terms) => terms.Any(q.Contains);
    private static string Money(decimal n) => n.ToString("N0", CultureInfo.GetCultureInfo("vi-VN")) + " ₫";

    internal static string ClassifyForTests(string question)
    {
        var q = N(question);
        if (H(q, "goi gym cua trung tam", "bao nhieu goi gym", "tat ca goi gym", "cac goi gym", "danh sach goi gym", "goi gym dang ban", "gym packages", "how many gym", "explore packages", "goi membership cua trung tam"))
            return "gym-catalog";
        if (H(q, "co the thue san nao", "co nhung san nao", "danh sach san thue", "co san nao cho thue", "san nao cho thue", "court rental", "rentable courts", "co may san thue"))
            return "court-catalog";
        if (H(q, "xem thong tin class", "xem thong tin lop", "xem chi tiet class", "xem chi tiet lop", "view details class", "thong tin class", "thong tin lop bad", "thong tin lop basket"))
            return "class-detail";
        if (H(q, "bao nhieu lop cua trung tam", "co bao nhieu lop", "cac lop dang ban", "danh sach lop dang mo", "class catalog"))
            return "class-catalog";
        return "none";
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid actorId, string question,
        IAiChatProvider provider, ISystemPromptReader promptReader, CancellationToken ct)
    {
        var intent = ClassifyForTests(question);
        if (intent == "none") return null;
        var member = await db.Set<UserAccount>().AsNoTracking().AnyAsync(
            u => u.UserId == actorId && u.Role != null && u.Role.RoleName == UserRole.Member, ct);
        if (!member) return null;

        var watch = Stopwatch.StartNew();
        string answer;
        string providerName = "member-verified";
        string modelName = "backend-read-only";
        string promptVersion = "member-catalog-v23";
        string interactionId = "member-catalog-v23-" + Guid.NewGuid().ToString("N");

        if (intent == "gym-catalog")
        {
            var packages = await db.Set<MembershipPackage>().AsNoTracking()
                .Where(x => x.IsActive).OrderBy(x => x.DurationDays).ThenBy(x => x.Price)
                .Select(x => new { x.Name, x.Price, x.OriginalPrice, x.DurationDays, x.Description })
                .ToListAsync(ct);
            var rows = packages.Take(35).Select(x =>
                $"- {x.Name}: {Money(x.Price)}; thời hạn {x.DurationDays} ngày" +
                (x.OriginalPrice.HasValue && x.OriginalPrice.Value > x.Price ? $"; giá gốc {Money(x.OriginalPrice.Value)}" : ""));
            answer = $"Trung tâm hiện có {packages.Count} gói Gym đang mở bán.\n" +
                string.Join("\n", rows) +
                (packages.Count > 35 ? "\nChỉ hiển thị 35 gói đầu tiên." : "") +
                "\nXem ở Services → Explore packages → Gym. Đây là danh mục bán, không phải gói bạn sở hữu.";
        }
        else if (intent == "court-catalog")
        {
            var rooms = await db.Set<Room>().AsNoTracking()
                .Where(r => r.IsActive && r.AllowRental && r.RoomTypeId != null)
                .OrderBy(r => r.Name).Select(r => new { r.RoomId, r.Name }).ToListAsync(ct);
            answer = $"Có {rooms.Count} phòng/sân được đánh dấu cho phép thuê trong danh mục.\n" +
                string.Join("\n", rooms.Take(35).Select(r => $"- {r.Name} (Room ID {r.RoomId})")) +
                (rooms.Count > 35 ? "\nDanh sách còn bản ghi chưa hiển thị." : "") +
                "\nDanh sách này KHÔNG xác nhận còn slot trống. Vào Services → Explore packages → Court rental → Select, " +
                "chọn môn/ngày/khung giờ. Trạng thái và giá chính xác lấy từ /api/court-rentals/calendar và /api/court-rentals/availability, không suy từ loại sân.";
        }
        else if (intent == "class-catalog")
        {
            var catalog = await db.Set<SportHub.Scheduling.Domain.Entities.Class>().AsNoTracking()
                .Where(c => c.EnrollmentOpen && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress))
                .OrderBy(c => c.Name).Select(c => new { c.Name, c.Code, c.Price, c.NumSessions,
                    c.Capacity, c.ReservedCount }).ToListAsync(ct);
            answer = $"Có {catalog.Count} lớp đang mở ghi danh trong danh mục.\n" +
                string.Join("\n", catalog.Take(35).Select(c => $"- {c.Name} ({c.Code}): {Money(c.Price)}, {c.NumSessions} buổi, {Math.Max(0, c.Capacity - c.ReservedCount)} chỗ chưa giữ.")) +
                "\nĐây là catalog trung tâm, không phải lớp bạn đã ghi danh. Xem Services → Explore packages → Group classes.";
        }
        else // class-detail: read a member-owned class first and analyze from verified evidence.
        {
            var e = await MemberScheduleServicesEvidenceV21.LoadAsync(
                db, actorId, MemberScheduleServicesEvidenceV21.Topic.ClassPlans, clock.UtcNow, ct);
            var published = await promptReader.GetPublishedAsync("Member", ct);
            var instructions = published.Content + "\nMEMBER CLASS DETAILS v23: " +
                "Use ONLY evidence for the authenticated member's confirmed class, sessions, and permitted plans. " +
                "Identify the class requested by code/name. If missing or ambiguous, ask which class. " +
                "For navigation: Services → My services → Class → View details, or My schedule → choose the class. " +
                "Do not confuse public catalog classes with the member's enrolled classes. " +
                "Do not invent coaches, session content, dates, prices or status. Answer in the user's language.";
            var generated = await provider.AskAsync(instructions,
                JsonSerializer.Serialize(new { source = "MemberScheduleServicesEvidenceV21", evidence = e }),
                question, null, ct);
            answer = AiPlainTextSanitizer.Clean(generated.Answer);
            if (string.IsNullOrWhiteSpace(answer))
                throw new InvalidOperationException("Member class analysis returned an empty answer.");
            providerName = generated.Provider;
            modelName = generated.Model;
            promptVersion = published.Version;
            interactionId = generated.InteractionId;
        }

        watch.Stop();
        var logId = Guid.NewGuid();
        // Do not log personal teaching content or evidence; keep inputs minimal.
        db.Set<AiLog>().Add(new AiLog {
            LogId = logId, UserId = actorId, QueryType = AiQueryTypes.Chat,
            InputPayload = JsonSerializer.Serialize(new { question, intent, version = "member-v23" }),
            ResponsePayload = JsonSerializer.Serialize(new { interactionId, provider = providerName, model = modelName,
                answer = "[REDACTED: Member response]", success = true }),
            ResponseTimeMs = (int)Math.Min(int.MaxValue, watch.ElapsedMilliseconds), CreatedAt = clock.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return new AiChatResponse(logId, interactionId, question, answer, providerName, modelName,
            promptVersion, (int)Math.Min(int.MaxValue, watch.ElapsedMilliseconds), clock.UtcNow);
    }
}
