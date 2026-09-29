namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Môn thể thao (BR-106/107). Ngừng hoạt động thay cho xóa cứng.</summary>
public class Sport
{
    public int SportId { get; set; }

    public string Name { get; set; } = string.Empty; // unique không phân biệt hoa/thường (citext)

    public SportOperationType OperationType { get; set; }

    /// <summary>Bắt buộc khi GroupCourse.</summary>
    public int? DefaultSessionMinutes { get; set; }

    /// <summary>Bắt buộc khi GroupCourse.</summary>
    public int? DefaultMaxCapacity { get; set; }

    public string? Description { get; set; }

    public string? ImageUrl { get; set; }

    public int SortOrder { get; set; }

    public bool IsActive { get; set; } = true;
}
