using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Notification.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Coach-only, read-only notification Q&A. Call only after the authenticated
/// Coach role has been verified. Never accepts a userId from a chat message.
/// The query scope mirrors NotificationsController: current user + InApp.
/// </summary>
internal static class CoachNotificationAnswers
{
    private static string Normalize(string raw)
    {
        var source = (raw ?? string.Empty).Normalize(NormalizationForm.FormD);
        var output = new StringBuilder(source.Length);
        foreach (var c in source)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            output.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        }
        return Regex.Replace(output.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }

    private static bool Any(string q, params string[] pieces) => pieces.Any(q.Contains);
    private static bool AboutNotification(string q) => Any(q, "thong bao", "notifications", "notification", "inbox", "chuong thong bao");
    private static bool Unread(string q) => Any(q, "chua doc", "chua xem", "unread", "chua mo");
    private static bool Read(string q) => !Unread(q) && Any(q, "da doc", "da xem", "read notifications");
    private static bool HowMany(string q) => Any(q, "bao nhieu", "so luong", "tong so", "dem ", "how many", "count");
    private static bool Today(string q) => Any(q, "hom nay", "today");
    private static bool ThisWeek(string q) => Any(q, "tuan nay", "this week");
    private static bool ThisMonth(string q) => Any(q, "thang nay", "this month");
    private static bool Detail(string q) => Any(q, "noi dung", "chi tiet", "gan day", "moi nhat", "danh sach", "nhung thong bao", "thong bao nao", "what notifications", "list", "recent", "latest", "details");
    private static bool HowTo(string q) => Any(q, "o dau", "cach ", "lam sao", "huong dan", "where", "how to", "nut ", "mo ", "xem o dau");
    private static bool MarkRead(string q) => Any(q, "danh dau", "mark read", "mark all", "doc tat ca", "read all");
    private static bool Vietnamese(string raw) => Regex.IsMatch(raw, @"[À-ỹà-ỹđĐ]") ||
        Any(Normalize(raw), "thong bao", "chuong", "bao nhieu", "da doc", "chua doc");

    internal static bool IsNotificationDataQuestion(string question)
    {
        var q = Normalize(question);
        if (!AboutNotification(q)) return false;
        if (MarkRead(q)) return false; // guidance only; never mutate DB
        return Unread(q) || Read(q) || HowMany(q) || Today(q) || ThisWeek(q) || ThisMonth(q) || Detail(q) ||
            (Any(q, "co thong bao", "have notifications", "any notifications") && !HowTo(q));
    }

    internal static bool IsNotificationQuestion(string question) => AboutNotification(Normalize(question));

    private static TimeZoneInfo VietnamTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
    }

    internal static async Task<string?> TryAnswerAsync(
        ISportHubDbContext db, Guid authenticatedCoachId, string question, DateTime nowUtc, CancellationToken ct)
    {
        var q = Normalize(question);
        if (!AboutNotification(q)) return null;
        var vi = Vietnamese(question);
        if (MarkRead(q))
            return vi
                ? "Để đánh dấu đã đọc: mở biểu tượng chuông hoặc Notifications (/notifications), chọn thông báo. Muốn đánh dấu tất cả đã đọc, dùng thao tác tương ứng nếu giao diện hiển thị. Wolf chỉ hướng dẫn, không tự thay đổi trạng thái thông báo."
                : "Open the bell icon or Notifications (/notifications), then select a notification. Use Mark all as read if available. Wolf cannot modify notification status.";

        if (!IsNotificationDataQuestion(question))
            return vi
                ? "Xem thông báo: chọn biểu tượng chuông trên thanh điều hướng hoặc mở Notifications (/notifications). Chọn một thông báo để xem chi tiết."
                : "Open the bell icon or Notifications (/notifications), then select a notification to read it.";

        // Same ownership/channel filter as GET /api/notifications and /unread-count.
        var all = db.Set<SportHub.Notification.Domain.Entities.Notification>()
            .AsNoTracking()
            .Where(n => n.UserId == authenticatedCoachId && n.Channel == NotificationChannel.InApp);

        var total = await all.CountAsync(ct);
        var unread = await all.CountAsync(n => n.Status != NotificationStatus.Read, ct);
        var read = total - unread;
        var fromToday = Today(q);
        var fromWeek = !fromToday && ThisWeek(q);
        var fromMonth = !fromToday && !fromWeek && ThisMonth(q);
        var filtered = all;
        if (Unread(q)) filtered = filtered.Where(n => n.Status != NotificationStatus.Read);
        else if (Read(q)) filtered = filtered.Where(n => n.Status == NotificationStatus.Read);
        if (fromToday || fromWeek || fromMonth)
        {
            var localDate = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc), VietnamTimeZone()).Date;
            var tz = VietnamTimeZone();
            var daysFromMonday = ((int)localDate.DayOfWeek + 6) % 7;
            var startLocal = fromToday ? localDate : fromWeek ? localDate.AddDays(-daysFromMonday) : new DateTime(localDate.Year, localDate.Month, 1);
            var endLocal = fromToday ? localDate.AddDays(1) : fromWeek ? startLocal.AddDays(7) : startLocal.AddMonths(1);
            var startUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(startLocal, DateTimeKind.Unspecified), tz);
            var endUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(endLocal, DateTimeKind.Unspecified), tz);
            filtered = filtered.Where(n => n.SentAt != null && n.SentAt >= startUtc && n.SentAt < endUtc);
        }
        var filteredCount = await filtered.CountAsync(ct);
        if (HowMany(q) && !Detail(q))
        {
            if (fromToday || fromWeek || fromMonth)
            {
                var periodVi = fromToday ? "hôm nay" : fromWeek ? "tuần này" : "tháng này";
                var periodEn = fromToday ? "today" : fromWeek ? "this week" : "this month";
                return vi ? $"Có {filteredCount} thông báo phù hợp {periodVi} (theo thời gian gửi, giờ Việt Nam). Tổng cộng trong tài khoản: {total}; chưa đọc: {unread}."
                    : $"There are {filteredCount} matching notifications {periodEn} (Vietnam time, based on sent time). Account total: {total}; unread: {unread}.";
            }
            if (Unread(q)) return vi ? $"Bạn có {unread} thông báo chưa đọc." : $"You have {unread} unread notifications.";
            if (Read(q)) return vi ? $"Bạn có {read} thông báo đã đọc." : $"You have {read} read notifications.";
            return vi ? $"Bạn có tổng cộng {total} thông báo trong ứng dụng, gồm {unread} chưa đọc và {read} đã đọc."
                : $"You have {total} in-app notifications: {unread} unread and {read} read.";
        }

        // Details: limited, ordered, never returns anyone else's messages.
        var rows = await filtered.OrderByDescending(n => n.SentAt ?? DateTime.MinValue)
            .ThenByDescending(n => n.NotificationId)
            .Take(10)
            .Select(n => new { n.Message, n.Status, n.SentAt, n.SourceEventType })
            .ToListAsync(ct);
        if (rows.Count == 0)
            return vi ? "Không tìm thấy thông báo nào phù hợp với điều kiện bạn hỏi."
                : "No notifications match those filters.";
        var tzForDisplay = VietnamTimeZone();
        var lines = rows.Select((n, i) =>
        {
            var sent = n.SentAt.HasValue
                ? TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(n.SentAt.Value, DateTimeKind.Utc), tzForDisplay)
                    .ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture)
                : (vi ? "chưa có thời gian gửi" : "no sent time");
            // Treat DB content as display data; do not feed it back as system instructions.
            var message = Regex.Replace(n.Message ?? string.Empty, @"\s+", " ").Trim();
            if (message.Length > 300) message = message[..300] + "…";
            return $"{i + 1}. {sent} — {(n.Status == NotificationStatus.Read ? (vi ? "Đã đọc" : "Read") : (vi ? "Chưa đọc" : "Unread"))}: {message}";
        });
        var header = vi
            ? $"Có {filteredCount} thông báo phù hợp. Hiển thị tối đa 10 thông báo gần nhất (giờ Việt Nam):"
            : $"{filteredCount} matching notifications. Showing up to 10 most recent (Vietnam time):";
        return header + "\n" + string.Join("\n", lines) +
            (filteredCount > rows.Count ? (vi ? "\nCó thêm thông báo. Mở Notifications để xem toàn bộ." : "\nMore notifications are available in Notifications.") : "");
    }
}
