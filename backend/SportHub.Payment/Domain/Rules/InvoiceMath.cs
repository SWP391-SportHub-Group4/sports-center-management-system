namespace SportHub.Payment.Domain.Rules;

/// <summary>
/// Số học đối soát hoá đơn — BR-41 (trần được phép thu) và BR-43 (doanh thu trừ điều chỉnh).
///
/// Một nơi duy nhất định nghĩa các đại lượng, vì "đã thu bao nhiêu" xuất hiện ở ít nhất bốn
/// chỗ (ghi nhận thanh toán, đổi trạng thái hoá đơn, gợi ý hoàn tiền, báo cáo doanh thu) và
/// mỗi chỗ tự tính là cách chắc chắn để chúng lệch nhau.
///
/// Ví dụ số và các ca biên: implementation-decisions.md mục C1.
/// </summary>
public readonly record struct InvoiceBalance(
    decimal TotalAmount,
    decimal CompletedAdjustments,
    decimal TotalCollected)
{
    /// <summary>
    /// Trần được phép thu (BR-41): TotalAmount trừ các điều chỉnh đã COMPLETED.
    /// Gồm cả ba loại Refund/Correction/Discount — BR-41 viết "các khoản điều chỉnh ĐÃ HOÀN
    /// THÀNH", không phân biệt loại.
    /// </summary>
    public decimal NetPayable => TotalAmount - CompletedAdjustments;

    /// <summary>Còn phải thu. Kẹp ở 0 — số âm nghĩa là đã hoàn tiền, không phải "thu thêm được".</summary>
    public decimal Outstanding => Math.Max(0m, NetPayable - TotalCollected);

    /// <summary>
    /// Phần đã thu vượt quá trần sau điều chỉnh. Phát sinh khi Manager duyệt hoàn tiền trên
    /// một hoá đơn đã thu đủ (ca dùng chính của BR-52) — tiền đã trả lại cho hội viên ngoài
    /// hệ thống. Hiển thị để đối soát, không phải lỗi.
    /// </summary>
    public decimal RefundedAmount => Math.Max(0m, TotalCollected - NetPayable);

    public bool IsFullyPaid => TotalCollected >= NetPayable && NetPayable >= 0m;
}

public static class InvoiceMath
{
    /// <summary>
    /// Trạng thái hoá đơn suy ra từ số liệu (SSOT §4).
    ///
    /// KHÔNG tự đưa về Void: Void chỉ đến từ một Correction toàn phần được duyệt, và đó là
    /// quyết định của Manager chứ không phải hệ quả số học. Hàm này cũng không bao giờ
    /// chuyển ngược Paid về PartiallyPaid vì điều chỉnh chỉ ghi thêm dòng (BR-40).
    /// </summary>
    public static InvoiceStatus DeriveStatus(InvoiceStatus current, InvoiceBalance balance)
    {
        if (current == InvoiceStatus.Void)
        {
            return InvoiceStatus.Void;
        }

        if (balance.IsFullyPaid)
        {
            return InvoiceStatus.Paid;
        }

        return balance.TotalCollected > 0m ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Issued;
    }

    /// <summary>
    /// BR-41 — kiểm tra trước khi ghi nhận một khoản thu mới.
    /// Thực thi ở ĐƯỜNG THU chứ không ở đường duyệt điều chỉnh: chặn ở đường điều chỉnh sẽ
    /// khiến không bao giờ hoàn tiền được cho hoá đơn đã thu đủ (xem C1).
    /// </summary>
    public static bool CanAcceptPayment(InvoiceBalance balance, decimal amount)
        => amount > 0m && balance.TotalCollected + amount <= balance.NetPayable;

    /// <summary>
    /// BR-55 — hạn thanh toán ban đầu: hai tháng kể từ ngày phát hành.
    /// Cộng theo THÁNG LỊCH (AddMonths) chứ không phải 60 ngày — "hai tháng" trong BR đọc
    /// tự nhiên là tháng lịch (diễn giải ở C1/A3, CẦN DUYỆT).
    /// </summary>
    public static DateTime InitialDueDate(DateTime issuedAtUtc) => issuedAtUtc.AddMonths(2);

    /// <summary>BR-55 — sau khi nhận cọc đầu tiên: 12 tháng kể từ ngày nhận cọc đó.</summary>
    public static DateTime DueDateAfterFirstDeposit(DateTime firstDepositUtc) => firstDepositUtc.AddMonths(12);
}
