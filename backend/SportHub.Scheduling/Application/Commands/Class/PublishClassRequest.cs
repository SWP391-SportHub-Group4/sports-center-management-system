namespace SportHub.Scheduling.Application.Commands;

/// <summary>Publish khóa: sinh đủ buổi và chiếm phòng/coach cho TẤT CẢ buổi, hoặc không làm gì (một buổi xung đột thì hủy cả publish).</summary>
public sealed class PublishClassRequest
{
    /// <summary>Version Manager đang xem; lệch (đã có người sửa) thì 409. Null = không kiểm.</summary>
    public int? ExpectedVersion { get; set; }
}
