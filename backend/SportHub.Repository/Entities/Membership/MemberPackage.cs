using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Membership.
// Đây là INSTANCE thật của 1 gói mà 1 Member đã mua/đang dùng — entity trung
// tâm để kiểm tra "Member còn quyền đăng ký lớp không" (BR-16).
// State machine: docs/00-Source-of-Truth.md §4 / Design v2 §2.1.
public class MemberPackage
{
    public Guid MemberPackageID { get; set; }

    public Guid MemberID { get; set; }

    public User? Member { get; set; }

    public int PackageID { get; set; }

    public MembershipPackage? Package { get; set; }

    public DateTime StartDate { get; set; }

    // Xác định gói còn hiệu lực theo thời gian hay không (điều kiện Expired, BR-11).
    public DateTime EndDate { get; set; }

    // Trừ nguyên tử (atomic) mỗi lần Enrollment thành công (ràng buộc #3) — chặn
    // overbooking theo buổi. Nullable = không giới hạn (khớp SessionLimit gốc).
    public int? RemainingSessions { get; set; }

    // PendingPayment -> Active -> Expired/Cancelled — chỉ gói Active mới được dùng để enroll.
    public MemberPackageStatus Status { get; set; }

    // Optimistic concurrency — tránh lost-update khi 2 request cùng sửa 1 gói
    // cùng lúc (ràng buộc #8). Cần cấu hình IsConcurrencyToken() ở Fluent API
    // khi thêm EF Core configuration (chưa làm ở bước này).
    public int Version { get; set; }
}
