using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;

namespace SportHub.Scheduling.Domain.Entities;

public class Enrollment
{
    public Guid EnrollmentId { get; set; } // PK

    public Guid SessionId { get; set; } // FK -> ClassSession

    public ClassSession? Session { get; set; }

    public Guid MemberId { get; set; } // FK -> UserAccount

    public UserAccount? Member { get; set; }

    public Guid MemberPackageId { get; set; } // FK -> MemberPackage bị trừ buổi

    public MemberPackage? MemberPackage { get; set; }

    public EnrollmentStatus Status { get; set; } // Confirmed/CancelledOnTime/CancelledLate

    public DateTime RegisteredAt { get; set; }

    // BR-50: chính sách hạn huỷ được CHỤP tại thời điểm đăng ký được xác nhận và bất biến
    // sau đó — Manager đổi cấu hình không làm đổi điều kiện của đăng ký đã tạo.
    // Vì vậy giá trị nằm ở Enrollment chứ không đọc từ SystemSetting lúc huỷ
    // (Design v2 §3.1 mô tả đọc lúc huỷ — trái BR-50, xem implementation-decisions.md A1).
    public int CancellationDeadlineHours { get; set; }

    public DateTime? CancelledAt { get; set; } // so với deadline để phân loại ON_TIME/LATE

    public Guid? CancelledByUserId { get; set; } // FK -> UserAccount, có thể khác Member (vd Receptionist hủy giúp)

    public UserAccount? CancelledByUser { get; set; }

    public Attendance? Attendance { get; set; } // 1-1
}
