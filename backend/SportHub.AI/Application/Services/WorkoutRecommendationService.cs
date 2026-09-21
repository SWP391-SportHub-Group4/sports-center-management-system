using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>Ba đầu vào bắt buộc của BR-26, đã được nạp đủ trước khi gọi provider.</summary>
public sealed record WorkoutSuggestionInput(
    Guid MemberId,
    string MemberName,
    string Goal,
    string Level,
    int HistoryWindowDays,
    int SessionsAttended,
    int SessionsMissed,
    int GymCheckIns,
    IReadOnlyList<string> RecentDisciplines,
    IReadOnlyList<string> RecentCoachNotes);

public sealed record WorkoutSuggestionDto(
    Guid MemberId,
    string MemberName,
    string Goal,
    string Level,
    WorkoutSuggestionInput Input,
    IReadOnlyList<string> Exercises,
    string Rationale,
    int ResponseTimeMs,
    DateTime GeneratedAt);

public interface IWorkoutRecommendationService
{
    Task<WorkoutSuggestionDto> SuggestAsync(Guid memberId, Guid coachId, CancellationToken ct = default);
}

/// <summary>
/// Gợi ý bài tập cho HLV — BR-26 (bắt buộc đủ ba đầu vào: mục tiêu, trình độ, lịch sử tập
/// ≥30 ngày gần nhất) và BR-27 (ghi AI_Logs kèm input, output, thời gian phản hồi).
///
/// Nạp dữ liệu và ghi log nằm ở đây; việc sinh gợi ý nằm sau
/// <see cref="IAiRecommendationService"/> để đổi sang provider khác (hoặc service Python
/// riêng, xem ghi chú ở interface đó) mà không phải đụng tới phần kiểm tra BR.
/// </summary>
public sealed class WorkoutRecommendationService(
    ISportHubDbContext db,
    IAiRecommendationService provider,
    IClock clock) : IWorkoutRecommendationService
{
    /// <summary>BR-26 — "lịch sử tập luyện bao gồm ít nhất 30 ngày gần nhất".</summary>
    public const int HistoryWindowDays = 30;

    public async Task<WorkoutSuggestionDto> SuggestAsync(
        Guid memberId,
        Guid coachId,
        CancellationToken ct = default)
    {
        // BR-26 đầu vào (1) và (2). Thiếu hồ sơ thì TỪ CHỐI chứ không đoán mặc định:
        // gợi ý dựa trên mục tiêu bịa ra còn tệ hơn là không có gợi ý.
        var profile = await db.Set<MemberTrainingProfile>()
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.MemberId == memberId, ct)
            ?? throw new ConflictException(
                "insufficient_ai_input",
                "Hội viên chưa khai hồ sơ tập luyện (mục tiêu, trình độ) — chưa đủ đầu vào cho gợi ý AI (BR-26).");

        var member = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking()
            .Where(u => u.UserId == memberId)
            .Select(u => new { u.Email, Name = u.Profile != null ? u.Profile.FullName : u.Email })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("member_not_found", "Không tìm thấy hội viên.");

        var sinceUtc = clock.UtcNow.AddDays(-HistoryWindowDays);

        // BR-26 đầu vào (3) — lịch sử tập 30 ngày gần nhất, gộp cả lớp có điểm danh lẫn
        // Gym check-in (BR-64): hội viên tập Gym tự do vẫn có lịch sử tập, chỉ là không qua lớp.
        var attendance = await db.Set<Enrollment>()
            .AsNoTracking()
            .Where(e => e.MemberId == memberId && e.Session!.StartAtUtc >= sinceUtc)
            .Select(e => new
            {
                Discipline = e.Session!.Class!.Discipline,
                AttendanceStatus = e.Attendance == null ? (AttendanceStatus?)null : e.Attendance.Status
            })
            .ToListAsync(ct);

        var gymCheckIns = await db.Set<GymCheckIn>()
            .CountAsync(g => g.MemberId == memberId && g.CheckInTime >= sinceUtc, ct);

        var coachNotes = await db.Set<WorkoutResult>()
            .AsNoTracking()
            .Where(r => r.Enrollment!.MemberId == memberId && r.RecordedAt >= sinceUtc)
            .OrderByDescending(r => r.RecordedAt)
            .Take(5)
            .Select(r => r.CoachComment ?? r.ProgressNote ?? string.Empty)
            .ToListAsync(ct);

        var input = new WorkoutSuggestionInput(
            memberId,
            member.Name,
            profile.Goal,
            profile.ExperienceLevel.ToString(),
            HistoryWindowDays,
            attendance.Count(a => a.AttendanceStatus == AttendanceStatus.Present),
            attendance.Count(a => a.AttendanceStatus is AttendanceStatus.Absent or AttendanceStatus.NoShow),
            gymCheckIns,
            [.. attendance.Select(a => a.Discipline).Distinct()],
            [.. coachNotes.Where(n => !string.IsNullOrWhiteSpace(n))]);

        var stopwatch = Stopwatch.StartNew();
        WorkoutSuggestion suggestion;
        string? failure = null;

        try
        {
            suggestion = await provider.SuggestWorkoutAsync(
                memberId, coachId, profile.Goal, profile.ExperienceLevel.ToString(), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // BR-27 nói "MỌI yêu cầu AI và phản hồi của nó" — lần gọi hỏng cũng là một yêu cầu,
            // và đó chính là loại bản ghi cần nhất khi đánh giá chất lượng. Ghi log rồi mới ném.
            failure = ex.Message;
            suggestion = new WorkoutSuggestion([], string.Empty);
        }

        stopwatch.Stop();
        var elapsedMs = (int)stopwatch.ElapsedMilliseconds;

        db.Set<AiLog>().Add(new AiLog
        {
            LogId = Guid.NewGuid(),
            UserId = coachId, // người YÊU CẦU gợi ý là HLV (BR-26), không phải hội viên
            QueryType = "WORKOUT_SUGGESTION",
            InputPayload = JsonSerializer.Serialize(input),
            ResponsePayload = JsonSerializer.Serialize(new
            {
                exercises = suggestion.Exercises,
                rationale = suggestion.Rationale,
                error = failure
            }),
            ResponseTimeMs = elapsedMs,
            CreatedAt = clock.UtcNow
        });

        await db.SaveChangesAsync(ct);

        if (failure is not null)
        {
            throw new AppException(
                502, "ai_provider_failed", $"Không tạo được gợi ý từ AI: {failure}");
        }

        return new WorkoutSuggestionDto(
            memberId,
            member.Name,
            profile.Goal,
            profile.ExperienceLevel.ToString(),
            input,
            suggestion.Exercises,
            suggestion.Rationale,
            elapsedMs,
            clock.UtcNow);
    }
}
