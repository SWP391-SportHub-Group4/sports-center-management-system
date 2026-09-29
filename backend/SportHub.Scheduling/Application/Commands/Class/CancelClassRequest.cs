using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>
/// Hủy khóa khi chưa có ghi danh/giữ chỗ nào. Khóa đã có người mua phải hủy qua quy trình ngưỡng hoàn vốn (hoàn điểm cho từng
/// ghi danh) — chưa hỗ trợ ở chặng này nên bị từ chối 409.
/// </summary>
public sealed class CancelClassRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
