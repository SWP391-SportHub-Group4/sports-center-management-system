using SportHub.Identity.Domain.Entities;

namespace SportHub.Administration.Domain.Entities;

/// <summary>
/// Cấu hình toàn hệ thống do Center Manager đặt (BR-39).
///
/// Entity MỚI, chưa có trong SSOT §2 — xem implementation-decisions.md mục A1 (CẦN DUYỆT).
/// Bắt buộc phải có nơi lưu vì BR-50 nói "Center Manager được cấu hình số giờ tối thiểu…"
/// mà không entity nào hiện có giữ được giá trị đó.
///
/// Dạng key/value có kiểu thay vì mỗi cấu hình một cột: số lượng khoá còn rất ít (2) và
/// thêm khoá mới không nên kéo theo migration. Giá trị lưu chuỗi, ép kiểu khi đọc.
/// </summary>
public class SystemSetting
{
    public string Key { get; set; } = string.Empty; // PK — xem SystemSettingKeys ở BuildingBlocks

    public string Value { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty; // hiển thị trên màn hình cấu hình

    public Guid? UpdatedByUserId { get; set; } // FK -> UserAccount, null với giá trị seed ban đầu

    public UserAccount? UpdatedByUser { get; set; }

    public DateTime UpdatedAt { get; set; }
}
