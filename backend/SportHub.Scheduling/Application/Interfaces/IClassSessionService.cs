using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassSessionService
{
    /// <summary>Toàn bộ buổi của khóa theo SessionNo. Coach chỉ xem khóa mình phụ trách (kiểm ở caller qua <paramref name="restrictToCoachId"/>).</summary>
    Task<IReadOnlyList<ClassSessionResponse>> ListByClassAsync(int classId, Guid? restrictToCoachId, CancellationToken ct = default);

    Task<ClassSessionResponse> GetAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default);

    Task<SessionRosterResponse> GetRosterAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default);

    /// <summary>Buổi sắp tới của một Member qua các ghi danh Confirmed.</summary>
    Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(Guid memberId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);

    Task<ClassSessionResponse> RescheduleAsync(Guid sessionId, RescheduleSessionRequest request, Guid actorUserId, CancellationToken ct = default);

    /// <summary>Hủy một buổi và tạo buổi bù ở cuối lịch trong cùng transaction. Trả buổi bù.</summary>
    Task<ClassSessionResponse> CancelWithMakeupAsync(Guid sessionId, CancelSessionRequest request, Guid actorUserId, CancellationToken ct = default);
}
