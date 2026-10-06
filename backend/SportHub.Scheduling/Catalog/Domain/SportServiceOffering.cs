using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Một dịch vụ của môn. UNIQUE(SportId, ServiceType). <see cref="IsEnabled"/> chỉ chặn giao dịch mới.</summary>
public class SportServiceOffering
{
    public int OfferingId { get; set; }

    public int SportId { get; set; }

    public SportServiceType ServiceType { get; set; }

    public bool IsEnabled { get; set; } = true;

    /// <summary>Bắt buộc và &gt; 0 với GroupCourse; phải NULL với dịch vụ khác. Chỉ ảnh hưởng lớp tạo sau đó.</summary>
    public int? DefaultSessionMinutes { get; set; }

    /// <summary>Bắt buộc và &gt; 0 với GroupCourse; phải NULL với dịch vụ khác.</summary>
    public int? DefaultMaxCapacity { get; set; }
}
