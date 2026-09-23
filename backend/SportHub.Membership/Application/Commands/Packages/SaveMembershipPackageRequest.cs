using System.ComponentModel.DataAnnotations;

namespace SportHub.Membership.Application.Commands;

public sealed class SaveMembershipPackageRequest
{
    [Required, MinLength(2), MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    // VND nguyên, không thập phân (SSOT §5.2). Cận trên là phòng vệ nhập liệu, không phải số từ BR.
    [Range(0, 1_000_000_000)]
    public decimal Price { get; set; }

    [Range(1, 3650)]
    public int DurationDays { get; set; }

    /// <summary>null = không giới hạn số buổi (SSOT §2).</summary>
    [Range(1, 10_000)]
    public int? SessionLimit { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }
}
