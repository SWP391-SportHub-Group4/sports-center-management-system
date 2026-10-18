using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassSessionService
{
    Task<ClassSessionResponse> ReportIncidentAsync(Guid sessionId, ReportSessionIncidentRequest request, Guid actorUserId, CancellationToken ct = default);
    /// <summary>Toàn bộ buổi của khóa theo SessionNo. Coach chỉ xem khóa mình phụ trách (kiểm ở caller qua <paramref name="restrictToCoachId"/>).</summary>
    Task<IReadOnlyList<ClassSessionResponse>> ListByClassAsync(int classId, Guid? restrictToCoachId, CancellationToken ct = default);

    Task<ClassSessionResponse> GetAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default);

    Task<SessionRosterResponse> GetRosterAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default);

    /// <summary>Buổi sắp tới của một Member qua các ghi danh Confirmed.</summary>
    Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(Guid memberId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);

    Task<ClassSessionResponse> RescheduleAsync(Guid sessionId, RescheduleSessionRequest request, Guid actorUserId, CancellationToken ct = default);

    /// <summary>Hủy một buổi và tạo buổi bù ở cuối lịch trong cùng transaction. Trả buổi bù.</summary>
    Task<ClassSessionResponse> CancelWithMakeupAsync(Guid sessionId, CancelSessionRequest request, Guid actorUserId, CancellationToken ct = default);

    /// <summary>
    /// Put a session back the way it was before an incident step moved it (or cancelled it for a makeup). Never throws for
    /// "cannot revert": it returns why, so abandoning an incident can revert what is safe and report the rest.
    /// Must run inside the caller's transaction.
    /// </summary>
    Task<SessionStepUndoOutcome> UndoIncidentStepAsync(Guid stepId, Guid actorUserId, CancellationToken ct = default);
}

public sealed record SessionStepUndoOutcome(bool Undone, string? Reason);
