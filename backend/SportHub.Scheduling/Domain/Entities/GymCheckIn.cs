using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Domain.Entities;

// Mới 18/09/2026 (SSOT §2, BR-64): ghi nhận Member vào tập Gym/Fitness tự do.
//
// Tách hẳn khỏi ClassSession/Enrollment/Attendance — Gym không đặt lịch nên không có
// Class nào cho Gym, và check-in này KHÔNG trừ RemainingSessions của bất kỳ gói nào.
// Cũng không lưu MemberPackageId: BR-64 chỉ cần "tồn tại >= 1 gói Active", không cần
// biết đã dùng gói nào.
public class GymCheckIn
{
    public Guid CheckInId { get; set; } // PK

    public Guid MemberId { get; set; } // FK -> UserAccount, người vào tập

    public UserAccount? Member { get; set; }

    public Guid CheckedInByUserId { get; set; } // FK -> UserAccount, Lễ tân thực hiện — luôn có giá trị, không self-service

    public UserAccount? CheckedInByUser { get; set; }

    public DateTime CheckInTime { get; set; } // UTC, lấy từ server chứ không nhận từ payload
}
