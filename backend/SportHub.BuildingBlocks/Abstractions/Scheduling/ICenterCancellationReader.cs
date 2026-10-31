namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Cổng đọc các quyền lợi (ghi danh lớp, lượt thuê sân) đã bị TRUNG TÂM hủy.
/// Payment dùng để dựng "đề nghị hoàn" cho Member mà không tham chiếu trực tiếp module Scheduling.
/// </summary>
public interface ICenterCancellationReader
{
    Task<IReadOnlyList<CenterCancelledEntitlement>> ListForMemberAsync(Guid memberId, DateTime sinceUtc,
        CancellationToken ct = default);

    /// <summary>Các mục bị trung tâm hủy trong [fromUtc, toUtc), cũ nhất trước; dùng để quét tự hoàn.</summary>
    Task<IReadOnlyList<CenterCancelledEntitlement>> ListCancelledBetweenAsync(DateTime fromUtc, DateTime toUtc,
        int skip, int take, CancellationToken ct = default);

    Task<CenterCancelledEntitlement?> GetAsync(Guid invoiceItemId, CancellationToken ct = default);
}

/// <param name="Kind">"Class" hoặc "CourtRental".</param>
public sealed record CenterCancelledEntitlement(Guid InvoiceItemId, Guid MemberId, string Kind, string Name,
    DateTime CancelledAtUtc, string? Reason,
    SportHub.BuildingBlocks.Abstractions.Payment.RefundFraction? Proration = null,
    decimal NonRefundableValueVnd = 0m);
