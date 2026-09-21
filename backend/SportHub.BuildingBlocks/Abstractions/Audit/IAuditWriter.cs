namespace SportHub.BuildingBlocks.Abstractions.Audit;

/// <summary>
/// Ghi Audit Log (BR-7). Interface đặt ở BuildingBlocks, bản cài đặt ở module Audit.
///
/// Lý do tách: module Audit tham chiếu Identity (AuditLog.UserId là FK thật sang UserAccount,
/// SSOT §2). Nếu Membership/Scheduling/... tham chiếu ngược Audit để ghi log thì sinh vòng
/// phụ thuộc. Interface ở tầng dùng chung cắt được vòng đó mà không cần lộ entity AuditLog.
///
/// KHÔNG tự SaveChanges: entry phải nằm trong CÙNG transaction với thao tác nghiệp vụ —
/// thao tác có hiệu lực mà không có log là vi phạm BR-7. Caller gọi SaveChangesAsync.
/// </summary>
public interface IAuditWriter
{
    void Write(AuditEntry entry);
}

/// <param name="ActorUserId">Người thực hiện — lấy từ JWT, không nhận từ body.</param>
/// <param name="Action">Chuỗi tự do UPPER_SNAKE_CASE (SSOT §2), vd LOCK_USER_ACCOUNT.</param>
/// <param name="TargetEntity">Tên entity bị tác động, vd UserAccount.</param>
/// <param name="TargetId">Khoá của đối tượng bị tác động, dạng chuỗi (PK có cả int lẫn Guid).</param>
/// <param name="OldValue">Trạng thái trước. Null nếu là thao tác tạo mới.</param>
/// <param name="NewValue">Trạng thái sau. Null nếu là thao tác xoá.</param>
/// <param name="Reason">Lý do — BẮT BUỘC với khoá/mở khoá tài khoản (BR-7) và duyệt điều chỉnh (BR-42).</param>
public sealed record AuditEntry(
    Guid ActorUserId,
    string Action,
    string TargetEntity,
    string TargetId,
    string? OldValue = null,
    string? NewValue = null,
    string? Reason = null);
