namespace SportHub.Payment.Domain.Enums;

// Trạng thái giao dịch thanh toán — chỉ Success tính vào tổng đã thu.
public enum PaymentStatus
{
    Pending,
    Success,
    Failed
}
