namespace SportHub.BuildingBlocks.Abstractions.Payment;

/// <summary>
/// Hoàn điểm tự động cho sự kiện hệ thống (hủy lớp do ngưỡng, sự cố sân, hủy thuê sân...). Bản cài đặt ở Payment.
/// Tính trần hoàn và cộng điểm từ InvoiceItem đã trả; không gọi lại service của module sở hữu quyền lợi —
/// module đó tự hủy/nhả quyền lợi trong cùng transaction. Idempotent theo <see cref="RefundCreditRequest.EventId"/>.
/// </summary>
public interface IRefundCreditService
{
    Task<RefundCreditResult> CreditAsync(RefundCreditRequest request, CancellationToken cancellationToken = default);
    Task<RefundCreditResult> CreditDifferenceAsync(RefundCreditDifferenceRequest request,
        CancellationToken cancellationToken = default);
    Task<decimal> GetRemainingItemValueVndAsync(Guid invoiceItemId, CancellationToken cancellationToken = default);
    Task LockPaidItemAsync(Guid invoiceItemId, CancellationToken cancellationToken = default);
    Task<int> GetSystemRefundPointsAsync(Guid invoiceItemId, CancellationToken cancellationToken = default);
    Task LockBatchAsync(IReadOnlyList<Guid> itemIds, IReadOnlyList<Guid> invoiceIds, CancellationToken cancellationToken = default);
}

/// <param name="RefundRatioPercent">0–100, tỉ lệ trên giá trị đã trả của item.</param>
/// <param name="EventId">Sự kiện gốc; cùng item + event chỉ hoàn một lần.</param>
public sealed record RefundCreditRequest(
    Guid InvoiceItemId,
    int RefundRatioPercent,
    string Reason,
    Guid EventId,
    int? ProratedNumerator = null,
    int? ProratedDenominator = null);

public sealed record RefundCreditResult(int PointsCredited, bool AlreadyApplied);

public sealed record RefundCreditDifferenceRequest(Guid InvoiceItemId, int Points, string Reason, Guid EventId);
