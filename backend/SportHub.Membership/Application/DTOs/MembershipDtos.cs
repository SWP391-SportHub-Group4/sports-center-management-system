using System.ComponentModel.DataAnnotations;

namespace SportHub.Membership.Application.DTOs;

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed record MembershipPackageDto(
    int PackageId,
    string Name,
    decimal Price,
    int DurationDays,
    int? SessionLimit,
    string? Description,
    bool IsActive);

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

public sealed record MemberPackageDto(
    Guid MemberPackageId,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    int PackageId,
    string PackageName,
    DateOnly StartDate,
    DateOnly EndDate,
    int? RemainingSessions,
    int? SessionLimit,
    string Status,
    bool IsUsable,
    bool StackingApproved,
    string? StackingApprovalReason);

public sealed record MemberTrainingProfileDto(
    Guid MemberId,
    string Goal,
    string ExperienceLevel,
    string? Notes,
    DateTime UpdatedAt);

public sealed class SaveTrainingProfileRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Goal { get; set; } = string.Empty;

    /// <summary>Tên member của enum ExperienceLevel (SSOT §3): Beginner/Intermediate/Advanced.</summary>
    [Required]
    public string ExperienceLevel { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Notes { get; set; }
}
