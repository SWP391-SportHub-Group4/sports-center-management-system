using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Domain.Constants;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member-only, deterministic answers for verified Overview, Account and Fitness Profile UI.
/// Invoked before the shared AI context/provider. It does not call AI Plan or Coach services.
/// No userId or role is accepted from user text. All private queries use authenticated userId.
/// </summary>
internal static class MemberPortalChat
{
    public static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid authenticatedUserId,
        string question, CancellationToken ct)
    {
        var q = Normalize(question);
        if (string.IsNullOrWhiteSpace(q)) return null;
        var intent = Classify(q);
        if (intent is null) return null;

        // Check role BEFORE any member-private query, independent of prompt or question text.
        var isMember = await db.Set<UserAccount>().AsNoTracking().AnyAsync(
            u => u.UserId == authenticatedUserId && u.Role != null &&
                 u.Role.RoleName == UserRole.Member, ct);
        if (!isMember) return null;

        var en = !ContainsVietnamese(question) && LooksEnglish(q);
        var answer = await AnswerAsync(db, authenticatedUserId, intent, en, ct);
        if (string.IsNullOrWhiteSpace(answer)) return null;

        var now = clock.UtcNow;
        var logId = Guid.NewGuid();
        var interactionId = Guid.NewGuid().ToString("N");
        const string version = "member-portal-verified-v1";
        db.Set<AiLog>().Add(new AiLog
        {
            LogId = logId,
            UserId = authenticatedUserId,
            QueryType = AiQueryTypes.Chat,
            InputPayload = JsonSerializer.Serialize(new { question, source = version }),
            ResponsePayload = JsonSerializer.Serialize(new
            {
                interactionId, answer, provider = "Member Portal Verified Knowledge",
                model = "local", success = true, source = version
            }),
            ResponseTimeMs = 0,
            CreatedAt = now
        });
        await db.SaveChangesAsync(ct);
        return new AiChatResponse(logId, interactionId, question, answer,
            "Member Portal Verified Knowledge", "local", version, 0, now);
    }

    private static string? Classify(string q)
    {
        bool Has(params string[] tokens) => tokens.Any(t => q.Contains(t, StringComparison.Ordinal));
        var how = Has("o dau", "lam sao", "cach ", "nut ", "cho nao", "thao tac", "where", "how to", "how do i", "navigate", "open ", "go to");
        var data = Has("cua toi", "toi dang", "toi co", "hien tai", "bao nhieu", "la gi", "what is my", "what's my", "my current", "my goal", "my bmi", "my weight", "my height", "do i have", "when does my");

        // Specific personal-data intents are evaluated before broad navigation keywords.
        if (Has("bmi", "chi so khoi co the")) return how && !data ? "fitness-nav" : "bmi";
        if (Has("can nang", "chieu cao", "weight", "height", "bao nhieu kg", "bao nhieu cm"))
            return how && !data ? "fitness-nav" : "measurements";
        if (Has("muc tieu", "goal", "kinh nghiem", "experience", "so ngay tap", "ngay mot tuan", "training days", "hoat dong", "activity", "the trang", "body build", "di ung", "allerg", "chan thuong", "han che", "diet"))
            return how && !data ? "fitness-nav" : "fitness-data";
        if (Has("goi gym", "goi tap", "gym membership", "membership", "thoi han goi", "package"))
            return how || Has("chon", "mua", "gia han", "renew", "choose", "buy") ? "membership-nav" : "membership-data";
        if (Has("avatar", "anh dai dien", "hinh dai dien")) return "avatar-nav";
        if (Has("mat khau", "password")) return "password-nav";
        if (Has("ma hoi vien", "member code", "qr code", "qr hoi vien")) return "member-code-nav";
        if (Has("ten cua toi", "so dien thoai cua toi", "email cua toi", "my name", "my email", "my phone")) return "account-data";
        if (Has("ho so ca nhan", "thong tin ca nhan", "tai khoan", "my account", "personal information", "update profile", "cap nhat ho so", "doi ten", "doi so dien thoai"))
            return how || Has("cap nhat", "doi ", "save", "sua ") ? "account-nav" : "account-data";
        if (Has("fitness profile", "ho so the chat", "ho so the luc", "ho so tap luyen", "ai workout suggestion", "workout suggestion")) return "fitness-nav";
        if (Has("lop hoc", "ghi danh", "dang ky lop", "join a class", "register", "recommended", "goi y cho ban", "explore courses")) return "classes-nav";
        if (Has("dat san", "thue san", "book a court")) return "court-nav";
        if (Has("lich cua toi", "lich hoc", "my schedule", "next session", "buoi hoc tiep theo")) return "schedule-nav";
        if (Has("hoa don", "thanh toan", "billing", "invoice")) return "billing-nav";
        if (Has("diem", "point", "wallet", "vi diem")) return "points-nav";
        // Never treat generic verbs such as "help develop" as navigation to Help.
        if (q.Trim() == "help" || Has("tro giup", "ho tro", "help center", "help page",
            "help desk", "contact support", "support request")) return "help-nav";
        if (Has("thong bao", "notification")) return "notifications-nav";
        if (Has("overview", "tong quan", "quick actions", "thao tac nhanh", "training summary", "tong quan luyen tap", "needs your attention")) return "overview-nav";
        if (Has("training", "tap luyen", "results", "progress", "ke hoach tap")) return "training-nav";
        return null;
    }

    private static async Task<string> AnswerAsync(ISportHubDbContext db, Guid uid, string intent, bool en, CancellationToken ct)
    {
        switch (intent)
        {
            case "overview-nav":
                return en ? "Open Overview (/member). The page contains Needs your attention, Quick actions, My schedule, Your membership, Training summary, Recommended for you and Fitness profile. Counts and recommendations depend on live account data."
                    : "Mở Overview (/member). Trang gồm Needs your attention, Quick actions, My schedule, Your membership, Training summary, Recommended for you và Fitness profile. Số liệu và lớp gợi ý thay đổi theo dữ liệu tài khoản.";
            case "account-nav":
                return en ? "Open your avatar menu (top right) → My Account (/account) → Personal Information. Edit your name or phone, then select Save profile."
                    : "Nhấn ảnh đại diện góc trên bên phải → My Account (/account) → Personal Information → sửa tên hoặc số điện thoại → Save profile.";
            case "avatar-nav":
                return en ? "Avatar menu → My Account (/account) → Personal Information → Browse → select a JPG, PNG or WebP image (up to 5 MB). Use the avatar editor's save/confirmation control if shown."
                    : "Nhấn ảnh đại diện → My Account (/account) → Personal Information → Browse → chọn ảnh JPG, PNG hoặc WebP (tối đa 5 MB), rồi xác nhận/lưu theo giao diện tải ảnh.";
            case "password-nav":
                return en ? "Avatar menu → My Account (/account) → Change password. Enter your current password, a new password and confirmation, then select Change password."
                    : "Nhấn ảnh đại diện → My Account (/account) → Change password → nhập mật khẩu hiện tại, mật khẩu mới và xác nhận → Change password.";
            case "member-code-nav":
                return en ? "Avatar menu (top right) → Member code. The application opens your Member QR/code panel."
                    : "Nhấn ảnh đại diện góc trên bên phải → Member code để xem mã/QR hội viên.";
            case "fitness-nav":
                return en ? "Avatar menu → Fitness Profile, or Training → Fitness profile (/member/training?tab=profile). Here you can edit goal, training experience, body measurements, routine, diet and limitations. Select Save profile. For AI workout suggestions, use Get AI Workout Suggestions after saving."
                    : "Nhấn ảnh đại diện → Fitness Profile; hoặc Training → Fitness profile (/member/training?tab=profile). Tại đây sửa mục tiêu, kinh nghiệm, chỉ số cơ thể, lịch tập, dinh dưỡng và hạn chế → Save profile. Muốn nhận gợi ý AI, lưu hồ sơ trước rồi chọn Get AI Workout Suggestions.";
            case "training-nav":
                return en ? "Open Training (/member/training). Use Plans, Results & progress or Fitness profile. Use View my class and court schedule to see scheduled activities."
                    : "Vào Training (/member/training). Chọn Plans, Results & progress hoặc Fitness profile. Chọn View my class and court schedule để xem lịch học và thuê sân.";
            case "classes-nav":
                return en ? "Open Services (/member/services) → Explore packages → Class, or use Overview → Join a class / Explore courses. Select a course and use its registration control if registration is open."
                    : "Mở Services (/member/services) → Explore packages → Class; hoặc Overview → Join a class / Explore courses. Chọn lớp phù hợp rồi đăng ký nếu còn mở ghi danh.";
            case "court-nav":
                return en ? "Overview → Book a court, or Services → Court. Select the sport, court and available timeslot, then review the booking details."
                    : "Vào Overview → Book a court hoặc Services → Court. Chọn môn, sân và khung giờ còn trống, sau đó kiểm tra thông tin đặt sân.";
            case "schedule-nav":
                return en ? "Open My schedule (/member/schedule) to review enrolled classes and court bookings. If Overview shows 'Your next session starts here', no upcoming session is displayed in that card; it does not prove your account has no historical activity."
                    : "Chọn My schedule (/member/schedule) để xem lịch lớp và thuê sân. Nếu Overview hiển thị 'Your next session starts here', thẻ này chưa có buổi sắp tới để hiển thị; không có nghĩa toàn bộ lịch sử tài khoản trống.";
            case "membership-nav":
                return en ? "Overview → Renew Gym membership or Choose a Gym membership, or Services → Explore packages → Gym. Choose a suitable package and review its price and validity before payment."
                    : "Từ Overview chọn Renew Gym membership hoặc Choose a Gym membership; cũng có thể vào Services → Explore packages → Gym. Kiểm tra giá và thời hạn gói trước khi thanh toán.";
            case "billing-nav": return en ? "Avatar menu → Billing (/member/finance). Review invoices, payment records and related financial information there."
                : "Nhấn ảnh đại diện → Billing (/member/finance) để xem hóa đơn và thông tin thanh toán.";
            case "points-nav": return en ? "Use Points in the top bar or avatar menu → Billing, then view your wallet/points information."
                : "Nhấn Points trên thanh menu hoặc ảnh đại diện → Billing để kiểm tra điểm và ví.";
            case "help-nav": return en ? "Avatar menu → Help (/member/help) to submit or follow a support request."
                : "Nhấn ảnh đại diện → Help (/member/help) để gửi hoặc theo dõi yêu cầu hỗ trợ.";
            case "notifications-nav": return en ? "Select the bell icon in the top navigation, or open Notifications (/notifications)."
                : "Nhấn biểu tượng chuông trên thanh menu hoặc mở Notifications (/notifications).";
            case "account-data":
            {
                var row = await db.Set<UserAccount>().AsNoTracking().Where(u => u.UserId == uid)
                    .Select(u => new { u.Email, name = u.Profile != null ? u.Profile.FullName : null,
                        phone = u.Profile != null ? u.Profile.Phone : null }).SingleOrDefaultAsync(ct);
                if (row is null) return en ? "Your account could not be retrieved." : "Chưa truy xuất được thông tin tài khoản.";
                return en ? $"Account name: {row.name ?? "not set"}. Email: {row.Email}. Phone: {row.phone ?? "not set"}."
                    : $"Tên tài khoản: {row.name ?? "chưa cập nhật"}. Email: {row.Email}. Số điện thoại: {row.phone ?? "chưa cập nhật"}.";
            }
            case "membership-data":
            {
                var packs = await db.Set<MemberPackage>().AsNoTracking().Where(p => p.MemberId == uid && p.Status == MemberPackageStatus.Active)
                    .OrderBy(p => p.EndDate).Take(10).Select(p => new { name = p.Package != null ? p.Package.Name : "Unknown", p.StartDate, p.EndDate, p.RemainingSessions }).ToListAsync(ct);
                if (packs.Count == 0) return en ? "No active membership package was found for your account. You can explore packages under Services."
                    : "Tài khoản hiện không có gói membership ở trạng thái Active. Bạn có thể xem gói tại Services.";
                return (en ? "Your active membership packages:\n" : "Các gói membership đang Active của bạn:\n") +
                    string.Join("\n", packs.Select(p => $"• {p.name}: {p.StartDate:dd/MM/yyyy} – {p.EndDate:dd/MM/yyyy}" +
                        (p.RemainingSessions.HasValue ? $", {p.RemainingSessions} sessions remaining" : "")));
            }
            case "bmi":
            case "measurements":
            case "fitness-data":
            {
                var p = await db.Set<MemberTrainingProfile>().AsNoTracking().Where(x => x.MemberId == uid).SingleOrDefaultAsync(ct);
                if (p is null) return en ? "You have not saved a Fitness profile yet. Open Training → Fitness profile."
                    : "Bạn chưa lưu Fitness Profile. Vào Training → Fitness profile để cập nhật.";
                if (intent == "measurements") return en ? $"Your self-reported measurements: height {p.HeightCm?.ToString("0.##") ?? "not set"} cm; weight {p.WeightKg?.ToString("0.##") ?? "not set"} kg."
                    : $"Chỉ số bạn tự khai: chiều cao {p.HeightCm?.ToString("0.##") ?? "chưa có"} cm; cân nặng {p.WeightKg?.ToString("0.##") ?? "chưa có"} kg.";
                if (intent == "bmi")
                {
                    var bmi = p.HeightCm is > 0 && p.WeightKg is > 0
                        ? (double)(p.WeightKg.Value / (p.HeightCm.Value / 100m * (p.HeightCm.Value / 100m))) : (double?)null;
                    return bmi.HasValue ? (en ? $"BMI calculated from your self-reported height and weight: {bmi.Value:F1} kg/m². This is a screening measure, not a diagnosis."
                        : $"BMI tính từ chiều cao và cân nặng bạn tự khai: {bmi.Value:F1} kg/m². BMI là chỉ số tham khảo, không phải chẩn đoán.")
                        : (en ? "Height or weight is missing from your Fitness profile." : "Fitness Profile chưa đủ chiều cao hoặc cân nặng để tính BMI.");
                }
                return en ? $"Your saved Fitness profile: goal {p.GoalType?.ToString() ?? p.Goal}; experience {p.ExperienceLevel}; activity level {p.ActivityLevel?.ToString() ?? "not set"}; preferred training {p.TrainingDaysPerWeek?.ToString() ?? "not set"} days/week; body build {p.BodyBuild ?? "not set"}. Updated {p.UpdatedAt:dd/MM/yyyy}."
                    : $"Fitness Profile đã lưu: mục tiêu {p.GoalType?.ToString() ?? p.Goal}; kinh nghiệm {p.ExperienceLevel}; mức hoạt động {p.ActivityLevel?.ToString() ?? "chưa có"}; số ngày tập {p.TrainingDaysPerWeek?.ToString() ?? "chưa có"} ngày/tuần; thể trạng {p.BodyBuild ?? "chưa có"}. Cập nhật {p.UpdatedAt:dd/MM/yyyy}.";
            }
            default: return string.Empty;
        }
    }

    private static string Normalize(string value)
    {
        var decomposition = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposition.Length);
        foreach (var c in decomposition)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c == 'đ' ? 'd' : c);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    private static bool ContainsVietnamese(string value) => value.Any(c => c is 'ă' or 'â' or 'ê' or 'ô' or 'ơ' or 'ư' or 'đ' or 'Ă' or 'Â' or 'Ê' or 'Ô' or 'Ơ' or 'Ư' or 'Đ') ||
        value.Normalize(NormalizationForm.FormD).Any(c => CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark);
    private static bool LooksEnglish(string q) => new[] { "how ", "where ", "what ", "my ", "update ", "change ", "show ", "book ", "join ", "membership", "fitness profile" }.Any(q.Contains);
}
