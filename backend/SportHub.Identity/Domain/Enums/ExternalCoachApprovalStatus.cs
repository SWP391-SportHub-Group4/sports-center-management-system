namespace SportHub.Identity.Domain.Enums;

// Trạng thái duyệt hồ sơ ExternalCoach (BR-105). Tách khỏi UserStatus: khóa tài khoản và duyệt hồ sơ là hai việc khác nhau.
public enum ExternalCoachApprovalStatus
{
    PendingApproval,
    Approved,
    Rejected,
    Suspended
}
