namespace SportHub.BuildingBlocks.Abstractions.Training;

/// <summary>
/// Ghi nhận quan hệ huấn luyện phát sinh TỰ ĐỘNG từ việc hội viên đăng ký lớp
/// (RelationshipSourceType.ClassBased — SSOT §3). Bản cài đặt ở module Training.
///
/// Ở BuildingBlocks vì Training đã tham chiếu Scheduling (WorkoutResult gắn với Enrollment),
/// nên Scheduling gọi ngược sang Training sẽ thành vòng phụ thuộc.
///
/// KHÔNG SaveChanges — hàm này được gọi bên trong transaction đăng ký lớp; tự lưu sẽ tách
/// quan hệ ra khỏi chính đăng ký đã sinh ra nó.
/// </summary>
public interface ICoachRelationshipRegistrar
{
    Task EnsureClassBasedAsync(Guid coachId, Guid memberId, int classId, CancellationToken cancellationToken = default);
}
