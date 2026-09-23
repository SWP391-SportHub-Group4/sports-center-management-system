namespace SportHub.Payment.Domain.Rules;

/// <summary>
/// Số học đối soát hoá đơn — BR-41 v1.4 (SSOT §5.7).
///
/// Một nơi duy nhất định nghĩa các đại lượng, vì "đã thu bao nhiêu" xuất hiện ở ít nhất bốn
/// chỗ (ghi nhận thanh toán, đổi trạng thái hoá đơn, gợi ý hoàn tiền, báo cáo doanh thu) và
/// mỗi chỗ tự tính là cách chắc chắn để chúng lệch nhau.
///
/// Thay đổi cốt lõi so với v1.3: điều chỉnh KHÔNG còn là một tổng duy nhất. Discount và
/// Correction giảm NGHĨA VỤ phải trả; Refund Completed giảm TIỀN THỰC THU. Gộp hai thứ này
/// lại (như bản cũ) khiến một Refund vừa giảm nghĩa vụ vừa được suy ra là đã trả lại tiền —
/// tức là ghi nhận giảm trừ hai lần cho cùng một khoản.
/// </summary>
/// <param name="TotalAmount">Giá trị hoá đơn đã phát hành; không đổi theo catalog (BR-30).</param>
/// <param name="GrossCollected">Tổng Payment ở trạng thái Success.</param>
/// <param name="ObligationReduction">Tổng Discount/Correction đã Completed.</param>
/// <param name="RefundedAmount">Tổng Refund đã Completed — chỉ khi có xác nhận thực trả (BR-42).</param>
public readonly record struct InvoiceBalance(
    decimal TotalAmount,
    decimal GrossCollected,
    decimal ObligationReduction,
    decimal RefundedAmount)
{
    /// <summary>
    /// Nghĩa vụ phải trả sau khi trừ các khoản giảm nghĩa vụ đã Completed (BR-41).
    /// Refund KHÔNG trừ ở đây — hoàn tiền không làm hội viên bớt nợ, nó trả lại tiền đã thu.
    /// Kẹp ở 0: nghĩa vụ âm không có nghĩa nghiệp vụ nào.
    /// </summary>
    public decimal NetPayable => Math.Max(0m, TotalAmount - ObligationReduction);

    /// <summary>
    /// Tiền thực còn giữ của hội viên: đã thu trừ đã thực hoàn (BR-41).
    /// Kẹp ở 0 để một dữ liệu hỏng không lan thành số âm khắp báo cáo; đường ghi phải chặn
    /// từ trước bằng <see cref="MaxRefundable"/> chứ không dựa vào phép kẹp này.
    /// </summary>
    public decimal NetCollected => Math.Max(0m, GrossCollected - RefundedAmount);

    /// <summary>Còn phải thu.</summary>
    public decimal Outstanding => Math.Max(0m, NetPayable - NetCollected);

    /// <summary>
    /// Tiền đang giữ vượt quá nghĩa vụ — tức là khoản CẦN HOÀN nhưng CHƯA hoàn.
    /// Khác hẳn <see cref="RefundedAmount"/> (đã hoàn). Trước đây hai khái niệm này là một
    /// biến duy nhất nên UI không thể nói được "cần hoàn" với "đã hoàn".
    /// </summary>
    public decimal RefundDue => Math.Max(0m, NetCollected - NetPayable);

    /// <summary>
    /// Trần tuyệt đối cho một khoản hoàn mới: không hoàn quá số tiền thực tế còn đang giữ
    /// (BR-52). RefundDue là điều kiện đủ khi complete; đây là điều kiện cần.
    /// </summary>
    public decimal MaxRefundable => NetCollected;

    public bool IsFullyPaid => NetCollected >= NetPayable;
}

public static class InvoiceMath
{
    /// <summary>
    /// Trạng thái hoá đơn suy ra từ số liệu (SSOT §4).
    ///
    /// KHÔNG tự đưa về Void: Void chỉ đến từ một Correction toàn phần được duyệt, và đó là
    /// quyết định của Manager chứ không phải hệ quả số học.
    ///
    /// BR-40: `Paid` là dữ kiện lịch sử "hoá đơn này đã từng được trả đủ" và KHÔNG bị một
    /// Refund kéo ngược về PartiallyPaid — điều chỉnh chỉ ghi thêm dòng. Số dư thực tế đọc ở
    /// <see cref="InvoiceBalance"/>, không đọc ở Status.
    /// </summary>
    public static InvoiceStatus DeriveStatus(InvoiceStatus current, InvoiceBalance balance)
    {
        if (current is InvoiceStatus.Void or InvoiceStatus.Paid)
        {
            return current;
        }

        if (balance.IsFullyPaid)
        {
            return InvoiceStatus.Paid;
        }

        return balance.GrossCollected > 0m ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Issued;
    }

    /// <summary>
    /// BR-41 — kiểm tra trước khi ghi nhận một khoản thu mới: phải dương và không vượt
    /// Outstanding. Thực thi ở ĐƯỜNG THU chứ không ở đường duyệt điều chỉnh: chặn ở đường
    /// điều chỉnh sẽ khiến không bao giờ hoàn tiền được cho hoá đơn đã thu đủ.
    /// </summary>
    public static bool CanAcceptPayment(InvoiceBalance balance, decimal amount)
        => amount > 0m && amount <= balance.Outstanding;

    /// <summary>
    /// BR-55 — hạn thanh toán ban đầu: hai tháng LỊCH kể từ ngày phát hành (A3 đã duyệt).
    /// </summary>
    public static DateTime InitialDueDate(DateTime issuedAtUtc) => issuedAtUtc.AddMonths(2);

    /// <summary>BR-55 — sau khi nhận cọc đầu tiên: 12 tháng lịch kể từ thời điểm nhận cọc đó.</summary>
    public static DateTime DueDateAfterFirstDeposit(DateTime firstDepositUtc) => firstDepositUtc.AddMonths(12);
}
