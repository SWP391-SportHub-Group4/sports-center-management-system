using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Domain.Constants;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>Member-only verified sport and rental service catalog. No claims about live slot availability.</summary>
internal static class MemberSportsCatalogV24
{
    private static string N(string input)
    {
        var sb = new StringBuilder();
        foreach (var ch in (input ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                sb.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
    private static bool H(string s, params string[] phrases) => phrases.Any(s.Contains);

    internal static string ClassifyForTests(string question)
    {
        var q = N(question);
        var sport = H(q, "mon nao", "mon the thao", "cac mon", "sports", "sport nao", "bo mon");
        var rental = H(q, "thue san", "san thue", "san nao", "court rental", "court", "dat san", "rent", "cho thue");
        var catalog = H(q, "trung tam", "dang co", "co nhung", "co bao nhieu", "danh sach", "co the", "bao nhieu", "cung cap", "ho tro", "available", "rentable", "list");
        if (rental && (sport || catalog || H(q, "co the thue", "thue duoc"))) return "rental";
        if (sport && catalog) return "sports";
        return "none";
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(ISportHubDbContext db, IClock clock,
        Guid authenticatedMemberId, string question, CancellationToken ct)
    {
        var intent = ClassifyForTests(question);
        if (intent == "none") return null;
        if (!await db.Set<UserAccount>().AsNoTracking().AnyAsync(u =>
            u.UserId == authenticatedMemberId && u.Role != null && u.Role.RoleName == UserRole.Member, ct))
            return null;

        var watch = Stopwatch.StartNew();
        var sports = await db.Set<Sport>().AsNoTracking().Where(s => s.IsActive)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.SportId)
            .Select(s => new { s.SportId, s.Name, s.Code }).ToListAsync(ct);
        string answer;
        if (intent == "sports")
        {
            answer = $"Trung tâm có {sports.Count} môn thể thao đang hoạt động trong danh mục:\n" +
                string.Join("\n", sports.Take(40).Select(s => $"- {s.Name} ({s.Code})")) +
                (sports.Count > 40 ? "\nDanh sách được giới hạn ở 40 môn đầu tiên." : "") +
                "\nLưu ý: một môn đang hoạt động không có nghĩa mọi dịch vụ (Gym, lớp nhóm, thuê sân) đều được bật.";
        }
        else
        {
            var rentalSportIds = await db.Set<SportServiceOffering>().AsNoTracking()
                .Where(o => o.IsEnabled && o.ServiceType == SportServiceType.CourtRental)
                .Select(o => o.SportId).Distinct().ToListAsync(ct);
            var rooms = await db.Set<Room>().AsNoTracking()
                .Where(r => r.IsActive && r.AllowRental)
                .OrderBy(r => r.Name)
                .Select(r => new { r.RoomId, r.Name, r.RoomTypeId, r.SportId }).ToListAsync(ct);
            var roomTypes = rooms.Where(r => r.RoomTypeId.HasValue).Select(r => r.RoomTypeId!.Value).Distinct().ToList();
            var links = await db.Set<SportRoomType>().AsNoTracking()
                .Where(link => roomTypes.Contains(link.RoomTypeId))
                .Select(link => new { link.SportId, link.RoomTypeId }).ToListAsync(ct);
            var types = rentalSportIds.ToHashSet();
            var rentable = sports.Where(s => types.Contains(s.SportId) && rooms.Any(r =>
                (r.RoomTypeId.HasValue && links.Any(l => l.RoomTypeId == r.RoomTypeId.Value && l.SportId == s.SportId)) ||
                (!r.RoomTypeId.HasValue && r.SportId == s.SportId)))
                .ToList();
            var listed = rentable.Select(s => new
            {
                s.Name,
                Courts = rooms.Where(r =>
                    (r.RoomTypeId.HasValue && links.Any(l => l.RoomTypeId == r.RoomTypeId.Value && l.SportId == s.SportId)) ||
                    (!r.RoomTypeId.HasValue && r.SportId == s.SportId))
                    .Select(r => r.Name).Distinct().ToList()
            }).ToList();
            answer = $"Có {listed.Count} môn có dịch vụ thuê sân đang bật và có phòng cho phép thuê:\n" +
                (listed.Count == 0 ? "Chưa xác định được môn có sân thuê phù hợp từ danh mục hiện tại." :
                string.Join("\n", listed.Take(30).Select(x =>
                    $"- {x.Name}: {x.Courts.Count} sân/phòng được cấu hình ({string.Join(", ", x.Courts.Take(8))})"))) +
                "\nĐể biết slot còn trống và giá chính xác, vào Services → Explore packages → Court rental → Select; chọn môn, ngày và giờ." +
                " Trạng thái slot và giá phải lấy từ API calendar/availability theo đúng thời điểm; danh mục này không xác nhận còn trống.";
        }
        watch.Stop();
        var logId = Guid.NewGuid();
        var interactionId = "member-sports-v24-" + Guid.NewGuid().ToString("N");
        db.Set<AiLog>().Add(new AiLog
        {
            LogId = logId,
            UserId = authenticatedMemberId,
            QueryType = AiQueryTypes.Chat,
            InputPayload = JsonSerializer.Serialize(new { question, intent, version = "member-v24" }),
            ResponsePayload = JsonSerializer.Serialize(new { provider = "member-verified", answer = "[REDACTED]", success = true }),
            ResponseTimeMs = (int)watch.ElapsedMilliseconds,
            CreatedAt = clock.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return new AiChatResponse(logId, interactionId, question, answer,
            "member-verified", "member-catalog-v24", "member-catalog-v24",
            (int)watch.ElapsedMilliseconds, clock.UtcNow);
    }
}
