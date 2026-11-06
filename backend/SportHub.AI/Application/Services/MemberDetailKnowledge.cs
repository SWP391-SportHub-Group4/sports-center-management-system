using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using MemberNotification = SportHub.Notification.Domain.Entities.Notification;

namespace SportHub.AI.Application.Services;

/// <summary>
/// MEMBER_KNOWLEDGE_V16: authorized, read-only answers for own enrollments, in-app
/// notifications, account, fitness profile, and support requests.  No Coach/AI Plan calls.
/// Runs before Member Overview v15, which otherwise mistakes own classes for catalog.
/// Do not persist passwords, private evidence or health notes to AI logs.
/// </summary>
internal static class MemberDetailKnowledge
{
    private static readonly TimeSpan Vn = TimeSpan.FromHours(7);
    private static readonly ConcurrentDictionary<Guid, (string Topic, DateTime Expires)> Topics = new();

    private static string N(string raw)
    {
        var b = new StringBuilder();
        foreach (var c in (raw ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                b.Append(c == 'đ' || c == 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return b.ToString().Normalize(NormalizationForm.FormC);
    }
    private static bool H(string s, params string[] words) => words.Any(w => s.Contains(w, StringComparison.Ordinal));
    private static string VN(DateTime d) => new DateTimeOffset(DateTime.SpecifyKind(d, DateTimeKind.Utc)).ToOffset(Vn).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
    private static string VN(DateTime? d) => d.HasValue ? VN(d.Value) : "chưa có";
    private static string Txt(string? s) => string.IsNullOrWhiteSpace(s) ? "chưa có dữ liệu" : s.Trim();
    private static string Ref(Guid id) => id.ToString("N")[..8].ToUpperInvariant();
    private static string Truncate(string s, int max = 420) => s.Length > max ? s[..max] + "…" : s;

    internal static string ClassifyForTests(string question)
    {
        var q = N(question);
        if (H(q, "thong bao", "notification", "chuong", "unread", "da doc")) return "notifications";
        if (H(q, "help", "request", "yeu cau", "ho tro", "khieu nai", "topic", "gui tin", "gui anh", "upload anh", "nhac ho", "reply", "phan hoi")) return "support";
        if (H(q, "mat khau", "password", "avatar", "anh dai dien", "tai khoan", "account", "email", "so dien thoai", "phone", "joined", "ngay tham gia", "trang thai tai khoan", "ho so ca nhan")) return "account";
        if (H(q, "fitness profile", "bmi", "chieu cao", "can nang", "goal", "muc tieu tap", "training experience", "body build", "than hinh", "sinh nhat", "ngay sinh", "gioi tinh", "sex", "daily activity", "so ngay tap", "dinh duong", "di ung", "chan thuong", "suc khoe", "workout suggestion", "ai workout", "save fitness", "luu fitness")) return "fitness";
        if (H(q, "lop", "class", "khoa", "course", "enrollment", "ghi danh", "tham gia", "join")) return "my-classes";
        if (H(q, "liet ke", "liệt kê", "danh sach", "ke ra", "cho toi xem", "nhung cai tren", "5 gan nhat", "nam gan nhat")) return "follow-up";
        return "legacy";
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid authenticatedUserId,
        string question, CancellationToken ct)
    {
        if (authenticatedUserId == Guid.Empty || string.IsNullOrWhiteSpace(question)) return null;
        var intent = ClassifyForTests(question);
        if (intent == "legacy") return null;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(12));
        ct = timeout.Token;
        var allowed = await db.Set<UserAccount>().AsNoTracking().AnyAsync(
            x => x.UserId == authenticatedUserId && x.Role != null && x.Role.RoleName == UserRole.Member, ct);
        if (!allowed) return null;
        var timer = Stopwatch.StartNew();
        var q = N(question);
        var now = clock.UtcNow;
        if (intent == "follow-up")
        {
            if (!Topics.TryGetValue(authenticatedUserId, out var state) || state.Expires < now)
                return Make("Bạn muốn liệt kê **thông báo**, **lớp đã ghi danh**, hay **yêu cầu hỗ trợ**? Hãy nêu rõ mục cần xem.");
            intent = state.Topic;
        }
        else if (intent is "notifications" or "my-classes" or "support")
            Topics[authenticatedUserId] = (intent, now.AddMinutes(5)); // topic only; no PII or cross-account IDs

        string? answer = null;
        if (intent == "my-classes")
        {
            // 'Can I join a class?' is discovery/eligibility, NOT an existing enrollment.
            if (H(q, "co the tham gia", "co the dang ky", "lop nao con cho", "lop dang mo", "lop goi y", "recommended", "gia cac lop", "hoc phi cac lop")) return null;
            var rows = db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == authenticatedUserId);
            var total = await rows.CountAsync(ct);
            var confirmed = await rows.CountAsync(e => e.Status == EnrollmentStatus.Confirmed, ct);
            if (H(q, "bao nhieu", "so luong", "may lop") && !H(q, "liet ke", "danh sach"))
                answer = $"Bạn có {confirmed} ghi danh lớp đang ở trạng thái Confirmed (tổng cộng {total} bản ghi ghi danh gồm cả trạng thái khác).";
            else
            {
                var list = await rows.OrderByDescending(e => e.EnrolledAt).Take(50)
                    .Select(e => new { e.Status, e.EnrolledAt, e.EndedAt,
                        Name = e.Class != null ? e.Class.Name : null,
                        Code = e.Class != null ? e.Class.Code : null,
                        StartDate = e.Class != null ? (DateOnly?)e.Class.StartDate : null,
                        Sessions = e.Class != null ? (int?)e.Class.NumSessions : null,
                        ClassStatus = e.Class != null ? e.Class.Status.ToString() : null,
                        Price = e.Class != null ? (decimal?)e.Class.Price : null })
                    .ToListAsync(ct);
                if (total == 0) answer = "Tài khoản Member này chưa có bản ghi ghi danh lớp. Các lớp đang mở bán KHÔNG phải lớp bạn đã tham gia.";
                else
                {
                    var sb = new StringBuilder($"Ghi danh lớp của tài khoản hiện tại: {confirmed} Confirmed / {total} tổng bản ghi.\n");
                    foreach (var e in list)
                        sb.Append("- ").Append(Txt(e.Name)).Append(" (").Append(Txt(e.Code)).Append(") · ghi danh ")
                            .Append(e.Status).Append(" · trạng thái lớp ").Append(Txt(e.ClassStatus))
                            .Append(" · ngày đăng ký ").Append(VN(e.EnrolledAt))
                            .Append(" · bắt đầu ").Append(e.StartDate?.ToString("dd/MM/yyyy") ?? "chưa có")
                            .Append(" · ").Append(e.Sessions?.ToString() ?? "?").Append(" buổi")
                            .AppendLine();
                    if (total > list.Count) sb.Append($"Chỉ hiển thị {list.Count}/{total} ghi danh mới nhất; không suy đoán các bản ghi chưa tải.\n");
                    sb.Append("Lưu ý: Confirmed là trạng thái ghi danh, không đồng nghĩa đã có mặt ở buổi học.");
                    answer = sb.ToString();
                }
            }
        }
        else if (intent == "notifications")
        {
            var rows = db.Set<MemberNotification>().AsNoTracking().Where(n => n.UserId == authenticatedUserId && n.Channel == NotificationChannel.InApp);
            var total = await rows.CountAsync(ct);
            var unread = await rows.CountAsync(n => n.Status != NotificationStatus.Read, ct);
            if (H(q, "o dau", "xem o dau", "cach xem", "mo trang"))
                answer = "Bấm biểu tượng chuông trên thanh điều hướng để mở Notifications. Bạn có thể xem nội dung và trạng thái từng thông báo.";
            else if (H(q, "bao nhieu", "so luong", "tong cong", "chua doc may") && !H(q, "liet ke", "noi dung", "gan nhat", "moi nhat"))
                answer = $"Bạn có {total} thông báo in-app, gồm {unread} chưa đọc và {total - unread} đã đọc.";
            else if (H(q, "quan trong nhat", "uu tien", "khac thuong", "phan tich", "vi sao"))
                return null; // Gemini v13 can reason from authorized notification evidence
            else
            {
                var limit = H(q, "tat ca", "toan bo") ? 30 : 5;
                var list = await rows.OrderByDescending(n => n.SentAt).ThenByDescending(n => n.NotificationId)
                    .Take(limit).Select(n => new { n.Message, n.SentAt, n.Status, n.SourceEventType }).ToListAsync(ct);
                var sb = new StringBuilder($"Thông báo in-app của bạn: {total} tổng cộng, {unread} chưa đọc. Liệt kê {list.Count} thông báo mới nhất:\n");
                for (var i = 0; i < list.Count; i++)
                    sb.Append(i + 1).Append(". ").Append(VN(list[i].SentAt)).Append(" · ")
                        .Append(list[i].Status).Append(" · ").Append(list[i].SourceEventType)
                        .Append(": ").Append(Truncate(list[i].Message)).AppendLine();
                if (total > list.Count) sb.Append($"Còn {total - list.Count} bản ghi chưa liệt kê; yêu cầu 'tất cả thông báo' để xem tối đa 30 bản ghi. ");
                if (list.Count == 0) sb.Append("Chưa có thông báo in-app.");
                answer = sb.ToString();
            }
        }
        else if (intent == "account")
        {
            if (H(q, "mat khau", "password"))
                answer = "Trong avatar góc phải → **My Account** → **Change password**. Nhập mật khẩu hiện tại, mật khẩu mới và xác nhận; nếu tài khoản chưa có mật khẩu có thể cần OTP email. Mật khẩu mới phải 8–64 ký tự, có chữ thường, chữ hoa, số, ký tự đặc biệt, và không chứa phần tên trước @ của email. Bấm **Change password**; Wolf không yêu cầu hoặc lưu mật khẩu của bạn.";
            else if (H(q, "avatar", "anh dai dien"))
                answer = "Vào **My Account** → **Personal Information** → **Browse** để tải avatar JPG, PNG hoặc WebP, tối đa 5 MB; có thể chọn **Remove avatar**. Không gửi ảnh hoặc thay đổi hồ sơ qua Wolf.";
            else if (H(q, "cach", "chinh sua", "cap nhat", "save profile", "luu ho so"))
                answer = "Vào avatar → **My Account**. Trong **Personal Information**, chỉnh **Full name** (bắt buộc), **Phone number** (tùy chọn và duy nhất nếu nhập), sau đó bấm **Save profile**. Email hiển thị theo tài khoản, không phải trường sửa trực tiếp trong form này.";
            else
            {
                var a = await db.Set<UserAccount>().AsNoTracking().Where(u => u.UserId == authenticatedUserId)
                    .Select(u => new { u.Email, u.Status, u.CreatedAt,
                        FullName = u.Profile != null ? u.Profile.FullName : null,
                        Phone = u.Profile != null ? u.Profile.Phone : null,
                        HasAvatar = u.Profile != null && u.Profile.AvatarUrl != null }).SingleOrDefaultAsync(ct);
                answer = a == null ? "Không tìm thấy tài khoản được xác thực." :
                    $"Tài khoản: {Txt(a.FullName)}; email: {a.Email}; trạng thái: {a.Status}; tham gia từ {VN(a.CreatedAt)}; điện thoại: {Txt(a.Phone)}; avatar: {(a.HasAvatar ? "đã có" : "chưa có")}. " +
                    "Đổi hồ sơ tại **My Account → Personal Information → Save profile**; đổi mật khẩu tại **Change password**.";
            }
        }
        else if (intent == "fitness")
        {
            if (H(q, "workout suggestion", "ai workout", "ai generation", "tao bai tap", "goi y bai tap"))
                answer = "Vào **Training → Fitness profile**, lưu hồ sơ trước, rồi bấm **Get AI Workout Suggestions** để mở /member/workout-suggestions. Đây là tính năng gợi ý workout riêng, không phải Coach AI Plan.";
            else if (H(q, "cac loai", "nhung loai", "tuy chon", "options", "lua chon", "bao nhieu muc"))
                answer = "Fitness profile có: 6 Goal (Fat loss, Muscle gain, Maintain, Endurance, Flexibility, General fitness); " +
                    "3 Training experience (Beginner, Intermediate, Advanced); Body build (Slender, Athletic, Fuller, Prefer not to specify); " +
                    "Sex (Female, Male, Prefer not to say); Daily activity (Sedentary, Lightly active, Moderately active, Very active); " +
                    "Dietary preferences (No preference, Vegetarian, Vegan, Pescatarian, Halal). " +
                    "Ngoài ra có Date of birth, Height, Weight, Target weight, Training days per week, Session minutes, " +
                    "Food allergies, Injuries/limitations, Add details và xác nhận trước khi Save profile.";
            else if (H(q, "cach", "o dau", "save fitness", "luu fitness", "cap nhat fitness", "sua fitness"))
                answer = "Vào **Training → Fitness profile**. Cập nhật Goal, Training experience, Body build, Date of birth, Sex, Height, Weight, Daily activity, Training days per week, Nutrition and health, và **Add details** tùy chọn. Xác nhận thông tin chính xác rồi bấm **Save profile**. Dữ liệu mới chỉ có hiệu lực sau khi lưu thành công.";
            else
            {
                var p = await db.Set<MemberTrainingProfile>().AsNoTracking().Where(x => x.MemberId == authenticatedUserId)
                    .Select(x => new { x.Goal, x.GoalType, x.ExperienceLevel, x.BodyBuild,
                        x.DateOfBirth, x.Sex, x.HeightCm, x.WeightKg, x.TargetWeightKg,
                        x.ActivityLevel, x.TrainingDaysPerWeek, x.SessionMinutes,
                        x.DietaryPreference, x.FoodAllergies, x.Notes, x.UpdatedAt }).SingleOrDefaultAsync(ct);
                if (p == null) answer = "Bạn chưa lưu Fitness profile. Vào Training → Fitness profile để cập nhật.";
                else
                {
                    decimal? bmi = p.HeightCm > 0 && p.WeightKg > 0
                        ? Math.Round(p.WeightKg.Value * 10000m / (p.HeightCm.Value * p.HeightCm.Value), 1, MidpointRounding.AwayFromZero) : null;
                    var category = !bmi.HasValue ? "chưa đủ dữ liệu" :
                        bmi.Value < 18.5m ? "Underweight" : bmi.Value < 25m ? "Normal" :
                        bmi.Value < 30m ? "Overweight" : "Obese";
                    answer = "Fitness profile đã lưu của bạn:\n" +
                        $"- Goal: {p.GoalType?.ToString() ?? Txt(p.Goal)}; mô tả: {Txt(p.Goal)}\n" +
                        $"- Training experience: {p.ExperienceLevel}; Body build: {Txt(p.BodyBuild)}\n" +
                        $"- DOB: {p.DateOfBirth?.ToString("dd/MM/yyyy") ?? "chưa có"}; Sex: {p.Sex?.ToString() ?? "chưa có"}\n" +
                        $"- Height: {p.HeightCm?.ToString() ?? "chưa có"} cm; Weight: {p.WeightKg?.ToString() ?? "chưa có"} kg; BMI: {bmi?.ToString("0.0") ?? "chưa đủ dữ liệu"} ({category})\n" +
                        $"- Target weight: {p.TargetWeightKg?.ToString() ?? "chưa có"} kg; Daily activity: {p.ActivityLevel?.ToString() ?? "chưa có"}\n" +
                        $"- Training days/week: {p.TrainingDaysPerWeek?.ToString() ?? "chưa có"}; Session minutes: {p.SessionMinutes?.ToString() ?? "chưa có"}\n" +
                        $"- Dietary preference: {p.DietaryPreference}; Food allergies/intolerances: {Txt(p.FoodAllergies)}\n" +
                        $"- Injuries/limitations or notes: {Txt(p.Notes)}\n" +
                        $"- Last saved: {VN(p.UpdatedAt)}. BMI dựa trên thông số tự khai, không phải chẩn đoán.";
                }
            }
        }
        else if (intent == "support")
        {
            if (H(q, "topic", "chu de", "danh muc", "loai yeu cau", "bao nhieu loai"))
                answer = "Help → Send a request có **6 topic**: Payment, Membership, Coach, Facilities, Account, Other (mã backend tương ứng PAYMENT, MEMBERSHIP, CLASS, FACILITY, ACCOUNT, OTHER).";
            else if (H(q, "gui request", "gui yeu cau", "send a request", "gui ho tro", "gui anh", "up anh", "upload anh", "bao nhieu anh", "gui tin", "cach gui"))
                answer = "Mở avatar → Help → **Send a request**. Chọn topic (bắt buộc), xem email tài khoản, nhập **Your message** (3–2000 ký tự), có thể tải tối đa **3 ảnh JPG/JPEG/PNG/WebP**, mỗi ảnh tối đa **5 MB**. Tick đồng ý sử dụng thông tin và bấm **Send** khi các điều kiện hợp lệ. Topic Payment có thể yêu cầu hóa đơn và ảnh chứng minh. Theo dõi tại **My requests**. Wolf chỉ hướng dẫn, không tự gửi request.";
            else if (H(q, "o dau", "xem o dau", "my requests", "request o dau"))
                answer = "Mở avatar → Help → **My requests**. Chọn từng request để xem trạng thái, mã tham chiếu, tiến trình, nội dung, ghi chú, hạn phản hồi và nút **Remind us** khi đủ điều kiện.";
            else
            {
                var rows = db.Set<MemberSupportRequest>().AsNoTracking().Where(x => x.MemberId == authenticatedUserId);
                var total = await rows.CountAsync(ct);
                var recent = await rows.OrderByDescending(x => x.CreatedAt).Take(20)
                    .Select(x => new { x.RequestId, x.Category, x.Subject, x.Description, x.Status,
                        x.CreatedAt, x.UpdatedAt, x.SlaDueAtUtc, x.ClosedAt,
                        x.ProgressNote, x.RemindCount, x.LastMemberRemindAtUtc }).ToListAsync(ct);
                var ids = recent.Select(x => x.RequestId).ToList();
                var events = await db.Set<MemberSupportEvent>().AsNoTracking()
                    .Where(e => ids.Contains(e.RequestId)).OrderByDescending(e => e.CreatedAt).Take(60)
                    .Select(e => new { e.RequestId, e.Type, e.Note, e.CreatedAt }).ToListAsync(ct);
                if (H(q, "bao nhieu", "may yeu cau", "so luong") && !H(q, "liet ke", "danh sach", "noi dung"))
                {
                    var active = await rows.CountAsync(x => x.ClosedAt == null && x.Status != "DONE" && x.Status != "CLOSED", ct);
                    answer = $"Bạn có {total} yêu cầu hỗ trợ; {active} yêu cầu chưa đóng theo trạng thái hiện tại.";
                }
                else if (total == 0) answer = "Bạn chưa có yêu cầu hỗ trợ nào trong tài khoản hiện tại.";
                else
                {
                    var sb = new StringBuilder($"Bạn có {total} yêu cầu hỗ trợ; hiển thị {recent.Count} gần nhất:\n");
                    foreach (var r in recent)
                    {
                        sb.Append("- #").Append(Ref(r.RequestId)).Append(" · ").Append(r.Category).Append(" · ").Append(r.Status)
                            .Append(" · gửi ").Append(VN(r.CreatedAt)).Append(" · SLA ").Append(VN(r.SlaDueAtUtc))
                            .Append("\n  Chủ đề: ").Append(Txt(r.Subject)).Append("; tin nhắn: ").Append(Truncate(r.Description))
                            .Append("\n  Ghi chú tiến độ: ").Append(Truncate(Txt(r.ProgressNote)))
                            .Append("; nhắc lại: ").Append(r.RemindCount).Append(" lần");
                        var ev = events.Where(e => e.RequestId == r.RequestId).OrderBy(e => e.CreatedAt).TakeLast(6).ToList();
                        if (ev.Count > 0)
                        {
                            sb.Append("\n  Sự kiện: ");
                            sb.Append(string.Join(" | ", ev.Select(e => VN(e.CreatedAt) + " " + e.Type + (string.IsNullOrWhiteSpace(e.Note) ? "" : ": " + Truncate(e.Note, 180)))));
                        }
                        sb.AppendLine();
                    }
                    if (total > recent.Count) sb.Append($"Còn {total - recent.Count} yêu cầu cũ chưa tải. ");
                    sb.Append("Thời gian SLA là mục tiêu phản hồi, không phải cam kết sẽ giải quyết đúng hạn.");
                    answer = sb.ToString();
                }
            }
        }
        return answer == null ? null : Make(answer);

        AiChatResponse Make(string message)
        {
            timer.Stop();
            // No AiLog write, no provider call. Exact app-scope read-only results.
            return new AiChatResponse(Guid.Empty, "member-knowledge-v16", question, message,
                "member-verified", "backend-read-only", "member-knowledge-v16",
                (int)Math.Min(int.MaxValue, timer.ElapsedMilliseconds), clock.UtcNow);
        }
    }
}
