namespace SportHub.Scheduling.Domain.Enums;

// Giữ chỗ khi checkout lớp (BR-115): Active chiếm reserved_count; Converted khi đã thanh toán (thành Enrollment).
public enum SeatHoldStatus
{
    Active,
    Converted,
    Expired,
    Released
}
