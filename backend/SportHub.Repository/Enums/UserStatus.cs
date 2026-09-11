namespace SportHub.Repository.Enums;

// Trạng thái tài khoản — không xoá cứng user (giữ lịch sử Payment/Attendance).
public enum UserStatus
{
    Active,
    Banned,
    Deactivated
}
