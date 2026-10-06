namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>
/// Môn thể thao (BR-106/107). Ngừng hoạt động thay cho xóa cứng. Môn có nhiều dịch vụ
/// (<see cref="SportServiceOffering"/>); không còn một "loại vận hành" duy nhất (CAT-01).
/// </summary>
public class Sport
{
    public int SportId { get; set; }

    /// <summary>Mã ổn định, duy nhất, không đổi sau khi tạo. Chỉ để định danh catalog/seed.</summary>
    public string Code { get; set; } = string.Empty; // citext

    public string Name { get; set; } = string.Empty; // unique không phân biệt hoa/thường (citext)

    public string? Description { get; set; }

    public string? ImageUrl { get; set; }

    public int SortOrder { get; set; }

    public bool IsActive { get; set; } = true;

    public List<SportServiceOffering> Services { get; set; } = [];
}
