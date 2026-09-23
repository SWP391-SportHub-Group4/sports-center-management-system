namespace SportHub.Membership.Domain.Entities;

public class MembershipPackage
{
    public int PackageId { get; set; } // PK

    public string Name { get; set; } = string.Empty; // unique trong catalog

    public decimal Price { get; set; }

    public int DurationDays { get; set; } // thời hạn sử dụng gói

    public int? SessionLimit { get; set; } // null = không giới hạn số buổi

    public string? Description { get; set; } // mô tả hiển thị cho hội viên khi chọn gói

    // BR-8 cho Manager "ngừng áp dụng" một gói. Không xoá cứng được vì MemberPackage đã bán
    // vẫn trỏ về đây và hoá đơn không bao giờ bị xoá (BR-40); gói ngừng bán chỉ biến mất khỏi
    // danh sách chọn, dữ liệu cũ giữ nguyên. Field MỚI — xem implementation-decisions.md A7.
    public bool IsActive { get; set; } = true;

    public ICollection<MemberPackage> MemberPackages { get; set; } = new List<MemberPackage>();
}
