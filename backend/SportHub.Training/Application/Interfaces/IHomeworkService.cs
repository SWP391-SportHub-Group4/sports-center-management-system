using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.Interfaces;

public interface IHomeworkService
{
    Task<IReadOnlyList<HomeworkResponse>> GetForCoachAsync(
        Guid coachId, Guid? memberId, HomeworkAssignmentStatus? status,
        int page, int pageSize, CancellationToken ct = default);
    Task<IReadOnlyList<HomeworkResponse>> GetForMemberAsync(
        Guid memberId, HomeworkAssignmentStatus? status,
        int page, int pageSize, CancellationToken ct = default);
    Task<HomeworkResponse> CreateAsync(CreateHomeworkRequest request, Guid coachId, CancellationToken ct = default);
    Task<HomeworkResponse> UpdateAsync(
        Guid assignmentId, UpdateHomeworkRequest request, Guid coachId, CancellationToken ct = default);
    Task<HomeworkResponse> UpdateByMemberAsync(
        Guid assignmentId, UpdateMemberHomeworkRequest request, Guid memberId, CancellationToken ct = default);
    Task<HomeworkResponse> ReviewAsync(
        Guid assignmentId, ReviewHomeworkRequest request, Guid coachId, CancellationToken ct = default);
    Task<HomeworkResponse> CancelAsync(Guid assignmentId, Guid coachId, CancellationToken ct = default);
}
