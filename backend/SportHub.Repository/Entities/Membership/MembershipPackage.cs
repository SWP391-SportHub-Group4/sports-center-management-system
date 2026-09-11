namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Membership.
// Đây là DANH MỤC gói tập trung tâm bán ra (template) — KHÔNG phải gói của 1
// Member cụ thể (đó là MemberPackage). Ví dụ: "Gói 3 tháng không giới hạn".
public class MembershipPackage
{
    public int PackageId { get; set; }

    // Unique trong catalog (BR-56, ràng buộc #13).
    public string Name { get; set; } = string.Empty;

    public decimal Price { get; set; }

    // Thời hạn sử dụng, tính từ MemberPackage.start_date.
    public int DurationDays { get; set; }

    // Nullable = không giới hạn số buổi.
    public int? SessionLimit { get; set; }

    // 1—N: 1 MembershipPackage được nhiều MemberPackage mua theo.
    public ICollection<MemberPackage> MemberPackages { get; set; } = new List<MemberPackage>();
}
