using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Membership.
// Đây là INSTANCE thật của 1 gói mà 1 Member đã mua/đang dùng — entity trung
// tâm để kiểm tra "Member còn quyền đăng ký lớp không" (BR-16).
// State machine: docs/00-Source-of-Truth.md §4 / Design v2 §2.1.
public class MemberPackage
{
    public Guid MemberPackageId { get; set; }

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    public int PackageId { get; set; }

    public MembershipPackage? Package { get; set; }

    public DateOnly StartDate { get; set; }

    // Xác định gói còn hiệu lực theo thời gian hay không (điều kiện Expired, BR-11).
    public DateOnly EndDate { get; set; }

    // Trừ nguyên tử (atomic) mỗi lần Enrollment thành công (ràng buộc #3) — chặn
    // overbooking theo buổi. Nullable = không giới hạn (khớp session_limit gốc).
    public int? RemainingSessions { get; set; }

    // PendingPayment -> Active -> Expired/Cancelled — chỉ gói Active mới được dùng để enroll.
    public MemberPackageStatus Status { get; set; }

    // Optimistic concurrency — tránh lost-update khi 2 request cùng sửa 1 gói
    // cùng lúc (ràng buộc #8) — cấu hình IsConcurrencyToken() ở AppDbContext.
    public int Version { get; set; }

    public ICollection<Enrollment> Enrollments { get; set; } = new List<Enrollment>();
}
