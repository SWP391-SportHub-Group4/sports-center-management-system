namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Membership.
// Đây là DANH MỤC gói tập trung tâm bán ra (template) — KHÔNG phải gói của 1
// Member cụ thể (đó là MemberPackage). Ví dụ: "Gói 3 tháng không giới hạn".
public class MembershipPackage
{
    public int package_id { get; set; }

    // Unique trong catalog (BR-56, ràng buộc #13).
    public string name { get; set; } = string.Empty;

    public decimal price { get; set; }

    // Thời hạn sử dụng, tính từ MemberPackage.start_date.
    public int duration_days { get; set; }

    // Nullable = không giới hạn số buổi.
    public int? session_limit { get; set; }

    // 1—N: 1 MembershipPackage được nhiều MemberPackage mua theo.
    public ICollection<MemberPackage> MemberPackages { get; set; } = new List<MemberPackage>();
}
