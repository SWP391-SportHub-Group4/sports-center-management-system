namespace SportHub.Repository.Enums.Payment;

// Vòng đời yêu cầu điều chỉnh thanh toán — Manager duyệt, không tự duyệt.
public enum PaymentAdjustmentStatus
{
    Requested,
    Approved,
    Rejected,
    Completed
}
