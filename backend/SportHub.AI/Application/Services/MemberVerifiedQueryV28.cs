using System.Diagnostics;
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
using SportHub.Training.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member-only privacy gate and verified answers that must not depend on Gemini being online.
/// Neither the requester nor a model can choose whose records to read.
/// </summary>
internal static class MemberVerifiedQueryV28
{
    private static string Normalize(string value)
    {
        var decomposed = (value ?? "").Normalize(NormalizationForm.FormD);
        var output = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                output.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return output.ToString().Normalize(NormalizationForm.FormC);
    }

    private static bool Has(string s, params string[] terms) =>
        terms.Any(term => s.Contains(term, StringComparison.Ordinal));

    internal static bool IsOtherMemberRequest(string question)
    {
        var q = Normalize(question);
        return Has(q,
            "hoc vien khac", "hoc sinh khac", "thanh vien khac", "nguoi khac",
            "hoc sinh hoc cung lop", "hoc vien hoc cung lop", "cac hoc sinh hoc cung lop",
            "ban cung lop", "ban hoc cung lop", "ban hoc", "ai cung lop", "ai hoc cung",
            "ai dang hoc cung", "danh sach hoc vien", "danh sach hoc sinh", "roster",
            "thong tin hoc sinh", "thong tin hoc vien", "thong tin cac ban",
            "lien he hoc vien", "so dien thoai hoc vien", "email hoc vien",
            "other member", "other student", "other people", "classmate",
            "who else is in", "who attends with", "students in my class", "students are in my class",
            "members in my class", "list of students", "list of members",
            "student contact", "student profile", "student details",
            "ai o trong lop", "ai trong lop", "nhung nguoi hoc cung", "hoc sinh trong lop",
            "ten cac ban", "ten hoc vien", "so nguoi trong lop", "bao nhieu hoc vien trong lop",
            "so luong hoc sinh trong lop", "class participant", "who is enrolled", "class roster");
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid memberId, string question, CancellationToken ct)
    {
        var q = Normalize(question);
        if (memberId == Guid.Empty || string.IsNullOrWhiteSpace(q)) return null;
        var isMember = await db.Set<UserAccount>().AsNoTracking().AnyAsync(u =>
            u.UserId == memberId && u.Role != null && u.Role.RoleName == UserRole.Member, ct);
        if (!isMember) return null;

        if (IsOtherMemberRequest(question))
        {
            var english = IsEnglish(question);
            return await ReturnAsync(db, clock, memberId, question, "member-privacy-v28",
                english
                    ? "I cannot provide information about other members or classmates. As a Member, you can access only your own enrollment, schedule, attendance and training records. Please contact an authorized staff member for class-related requests."
                    : "Tôi không thể cung cấp thông tin về các hội viên hoặc học viên khác, kể cả người học cùng lớp. Tài khoản Member chỉ được xem lịch học, điểm danh và thông tin tập luyện của chính mình. Bạn có thể liên hệ nhân viên có thẩm quyền nếu cần hỗ trợ về lớp.", ct);
        }

        var isAttendance = Has(q, "diem danh", "attendance", "da co mat", "vang mat", "da tham gia buoi", "check attendance");
        var isNearest = Has(q, "lich hoc gan nhat", "buoi hoc gan nhat", "buoi tiep theo", "buoi sap toi",
            "lich hoc tiep", "khi nao hoc", "next class", "next session", "upcoming class", "when is my class");
        if (isAttendance || isNearest)
        {
            var timeline = await MemberSessionTimelineV28.LoadAsync(db, memberId, clock.UtcNow, ct);
            var english = IsEnglish(question);
            var now = clock.UtcNow;
            var sessions = timeline.Sessions.Where(s => s.SessionStatus != "Cancelled").ToList();
            var current = sessions.FirstOrDefault(s => s.StartAtUtc <= now && s.EndAtUtc > now);
            var next = sessions.FirstOrDefault(s => s.StartAtUtc > now);
            var previous = sessions.LastOrDefault(s => s.EndAtUtc <= now);
            var attendanceTarget = current ?? previous ?? next;
            var asksCurrent = Has(q, "hien tai", "luc nay", "ngay bay gio", "right now", "currently");
            var asksHistory = Has(q, "tong hop", "lich su", "qua khu", "tuong lai", "tat ca", "cac buoi",
                "summary", "history", "past", "future", "all sessions", "attendance report");
            string answer;
            if (isAttendance && asksHistory)
            {
                var relevant = sessions.Where(x => x.TemporalPhase != "Cancelled").ToList();
                var details = relevant.OrderByDescending(x => x.StartAtUtc).Take(6)
                    .Select(x => $"{x.ClassName} #{x.SessionNo}: {x.StartsAtVietnam} " +
                        (x.AttendanceStatus == "Present" ? (english ? "Present" : "Có mặt")
                            : x.AttendanceStatus == "Absent" ? (english ? "Absent" : "Vắng mặt")
                            : x.TemporalPhase == "Future" ? (english ? "Not yet held" : "Chưa diễn ra")
                            : (english ? "Not recorded" : "Chưa ghi nhận"))).ToArray();
                answer = (english
                    ? $"Within the retrieved {relevant.Count} non-cancelled sessions: " +
                      $"{relevant.Count(x => x.AttendanceStatus == "Present")} recorded Present; " +
                      $"{relevant.Count(x => x.AttendanceStatus == "Absent")} recorded Absent; " +
                      $"{relevant.Count(x => x.AttendanceStatus is null)} without an attendance record. "
                    : $"Trong {relevant.Count} buổi không bị hủy được truy xuất: " +
                      $"{relevant.Count(x => x.AttendanceStatus == "Present")} buổi đã ghi Có mặt; " +
                      $"{relevant.Count(x => x.AttendanceStatus == "Absent")} buổi đã ghi Vắng mặt; " +
                      $"{relevant.Count(x => x.AttendanceStatus is null)} buổi chưa có bản ghi điểm danh. ") +
                    string.Join("; ", details) + (english ? ". Times are in Vietnam time (UTC+7)." : ". Tất cả thời gian theo giờ Việt Nam (UTC+7). ") +
                    (timeline.PastTruncated || timeline.FutureTruncated
                        ? (english ? " This is a limited history, not an all-time total."
                            : " Dữ liệu có giới hạn, không phải thống kê toàn bộ lịch sử.") : "");
            }
            else if (isAttendance)
            {
                if (attendanceTarget is null)
                    answer = english ? "Your account has no confirmed class sessions in the available schedule. Attendance cannot be verified."
                        : "Tài khoản của bạn không có buổi học đã xác nhận trong lịch truy xuất được nên chưa thể xác minh điểm danh.";
                else
                {
                    var phase = attendanceTarget.TemporalPhase;
                    var state = attendanceTarget.AttendanceStatus == "Present"
                        ? (english ? "Recorded: Present." : "Đã điểm danh: Có mặt.")
                        : attendanceTarget.AttendanceStatus == "Absent"
                            ? (english ? "Recorded: Absent." : "Đã điểm danh: Vắng mặt.")
                            : phase == "Future"
                                ? (english ? "The session has not taken place; no attendance has been recorded."
                                    : "Buổi học chưa diễn ra và chưa có bản ghi điểm danh.")
                                : (english ? "No attendance has been recorded. This does not mean you were absent."
                                    : "Chưa có bản ghi điểm danh. Điều này không có nghĩa bạn bị tính vắng mặt.");
                    answer = (english
                        ? $"{attendanceTarget.ClassName}, session {attendanceTarget.SessionNo}: {attendanceTarget.StartsAtVietnam}–{attendanceTarget.EndsAtVietnam[11..]} (Vietnam time, UTC+7). "
                        : $"Lớp {attendanceTarget.ClassName}, buổi {attendanceTarget.SessionNo}: {attendanceTarget.StartsAtVietnam}–{attendanceTarget.EndsAtVietnam[11..]} (giờ Việt Nam, UTC+7). ") + state;
                    if (asksCurrent && current is null)
                        answer = (english
                            ? "No class session is in progress right now. The closest recorded/relevant session is: "
                            : "Hiện tại không có buổi học nào đang diễn ra. Buổi gần nhất liên quan là: ") + answer;
                    if (current is null && previous is not null && next is not null)
                        answer += english
                            ? $" Next session: {next.StartsAtVietnam} (Vietnam time)."
                            : $" Buổi tiếp theo: {next.StartsAtVietnam} (giờ Việt Nam).";
                }
            }
            else if (next is not null)
                answer = english
                    ? $"Your next class is {next.ClassName}, session {next.SessionNo}, on {next.StartsAtVietnam}–{next.EndsAtVietnam[11..]} (Vietnam time, UTC+7). Location: {next.Room ?? "not specified"}. Session status: {next.SessionStatus}."
                    : $"Buổi học sắp tới là {next.ClassName}, buổi {next.SessionNo}, ngày {next.StartsAtVietnam}–{next.EndsAtVietnam[11..]} (giờ Việt Nam, UTC+7). Địa điểm: {next.Room ?? "chưa có thông tin"}. Trạng thái: {next.SessionStatus}.";
            else
                answer = english
                    ? "No future confirmed class session is available for your account in the retrieved schedule."
                    : "Không tìm thấy buổi học tương lai đã xác nhận cho tài khoản của bạn trong lịch truy xuất được.";
            return await ReturnAsync(db, clock, memberId, question, "member-session-v28", answer, ct);
        }

        // Compare own saved Coach workout plans without leaking other students' plans.
        var planAnalysis = Has(q, "plan nao kho", "ke hoach nao kho", "bai tap nao kho nhat",
            "phan tich cac plan", "so sanh cac plan", "so sanh plan", "which plan is hardest",
            "hardest plan", "most difficult plan", "compare my workout plans");
        if (planAnalysis)
        {
            var plans = await db.Set<WorkoutPlan>().AsNoTracking().Where(x => x.MemberId == memberId)
                .OrderByDescending(x => x.UpdatedAt).Take(30)
                .Select(x => new { x.PlanId, x.Goal, x.Level, x.Status, x.CreatedAt }).ToListAsync(ct);
            var ids = plans.Select(x => x.PlanId).ToList();
            var items = await db.Set<WorkoutPlanItem>().AsNoTracking().Where(i => ids.Contains(i.PlanId))
                .Select(i => new { i.PlanId, i.Sets, i.Reps, i.Exercise }).ToListAsync(ct);
            var english = IsEnglish(question);
            string answer;
            if (plans.Count == 0)
                answer = english ? "I found no saved Coach workout plans for your account to compare."
                    : "Chưa tìm thấy giáo án tập luyện do Coach lưu cho tài khoản của bạn để so sánh.";
            else
            {
                var ranked = plans.Select(p => new {
                    p.Goal, p.Level, p.Status, p.CreatedAt,
                    ExerciseCount = items.Count(i => i.PlanId == p.PlanId),
                    Sets = items.Where(i => i.PlanId == p.PlanId).Sum(i => i.Sets),
                    Repetitions = items.Where(i => i.PlanId == p.PlanId).Sum(i => i.Sets * i.Reps)
                }).OrderByDescending(x => x.Sets).ThenByDescending(x => x.Repetitions).ToList();
                var highest = ranked[0];
                var label = $"{highest.Goal} ({highest.Level}, {highest.CreatedAt:dd/MM/yyyy})";
                answer = english
                    ? $"Among {ranked.Count} recently saved Coach plans, {label} has the highest listed volume by total sets: {highest.Sets} sets across {highest.ExerciseCount} exercises ({highest.Repetitions} planned repetitions). This is a workload comparison, not proof it is the hardest: weights, rest time, intensity and your condition are not established by sets/reps alone."
                    : $"Trong {ranked.Count} giáo án Coach gần đây, {label} có khối lượng theo số hiệp cao nhất: {highest.Sets} hiệp ở {highest.ExerciseCount} bài ({highest.Repetitions} lần lặp dự kiến). Đây là so sánh khối lượng, không khẳng định giáo án khó nhất thực tế vì còn phụ thuộc mức tạ, thời gian nghỉ, cường độ và thể trạng.";
                if (plans.Count == 30) answer += english
                    ? " Only the 30 most recently updated plans were compared."
                    : " Chỉ so sánh 30 giáo án cập nhật gần nhất.";
            }
            return await ReturnAsync(db, clock, memberId, question, "member-workout-analysis-v28", answer, ct);
        }
        return null;
    }

    private static bool IsEnglish(string question)
    {
        var q = Normalize(question);
        return !Has(q, "toi ", "cua toi", "ban ", "lich ", "hoc ", "buoi ", "diem danh",
            "bao nhieu", "khi nao", "cho toi", "lop ", "ke hoach", "tap ", "thong tin", "cung lop") &&
            Has(q, "my ", "which", "when", "who", "where", "how", "what", "students", "members", "classmates", "attendance");
    }

    private static async Task<AiChatResponse> ReturnAsync(ISportHubDbContext db, IClock clock,
        Guid memberId, string question, string category, string answer, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var interactionId = Guid.NewGuid().ToString("N");
        var at = clock.UtcNow;
        db.Set<AiLog>().Add(new AiLog
        {
            LogId = id, UserId = memberId, QueryType = AiQueryTypes.Chat,
            InputPayload = JsonSerializer.Serialize(new { category, version = "member-v28", question }),
            ResponsePayload = JsonSerializer.Serialize(new { interactionId, answer = "[REDACTED]", category,
                provider = "SportHub verified member data", model = "local", success = true }),
            ResponseTimeMs = 0, CreatedAt = at
        });
        await db.SaveChangesAsync(ct);
        return new AiChatResponse(id, interactionId, question, answer,
            "SportHub verified member data", "local", "member-v28", 0, at);
    }
}
