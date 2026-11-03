namespace SportHub.Scheduling.Domain.Enums;

// Ghi danh chỉ sinh ra từ thanh toán thành công (không có ghi danh miễn phí). Mọi trạng thái khác Confirmed đều là kết thúc.
public enum EnrollmentStatus
{
    Confirmed,
    TransferredOut,
    Refunded,
    CancelledByCenter
}
