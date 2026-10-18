namespace SportHub.BuildingBlocks.Abstractions.Training;

/// <summary>
/// Ghi nhận quan hệ huấn luyện phát sinh TỰ ĐỘNG từ việc hội viên đăng ký lớp
/// (RelationshipSourceType.ClassBased — SSOT §3). Bản cài đặt ở module Training.
///
/// Ở BuildingBlocks vì Training đã tham chiếu Scheduling (WorkoutResult gắn với Enrollment),
/// nên Scheduling gọi ngược sang Training sẽ thành vòng phụ thuộc.
///
/// EnsureClassBasedAsync stages a new relationship for the caller to save. ReconcileAsync saves
/// lifecycle changes in the caller's transaction, or owns a transaction for periodic cleanup.
/// </summary>
public interface ICoachRelationshipRegistrar
{
    Task EnsureClassBasedAsync(Guid coachId, Guid memberId, int classId, CancellationToken cancellationToken = default);

    /// <summary>After saving enrollment/assignment changes, close unsupported pairs in the caller's transaction.</summary>
    Task ReconcileAsync(Guid? memberId, Guid? coachId, Guid? actorUserId, string reason,
        CancellationToken cancellationToken = default);
}
