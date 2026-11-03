namespace SportHub.Identity.Domain.Enums;

// Trạng thái tài khoản — không xoá cứng user (giữ lịch sử Payment/Attendance).
public enum UserStatus
{
    Active = 0,
    // Persisted value 1 belonged to the retired Banned state. Never reuse or renumber it.
    Deactivated = 2
}
