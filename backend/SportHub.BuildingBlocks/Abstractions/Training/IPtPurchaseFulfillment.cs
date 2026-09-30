namespace SportHub.BuildingBlocks.Abstractions.Training;

/// <summary>
/// Mua gói PT: tổng quota và giá do Training tính (BR-71), không tin số từ client.
/// Bản cài đặt ở Training; cùng transaction caller, không SaveChanges.
/// </summary>
public interface IPtPurchaseFulfillment
{
    Task<PtPurchaseQuote> QuoteAsync(PtPurchaseRequest request, CancellationToken cancellationToken = default);

    /// <summary>Tạo entitlement chờ thanh toán kèm snapshot đơn giá, quota, tần suất.</summary>
    Task<Guid> CreatePendingAsync(PtPurchaseRequest request, Guid invoiceItemId, CancellationToken cancellationToken = default);

    /// <summary>Kích hoạt sau khi đã trả. Idempotent.</summary>
    Task ActivateAsync(Guid ptEntitlementId, CancellationToken cancellationToken = default);

    Task CancelAsync(Guid ptEntitlementId, string reason, CancellationToken cancellationToken = default);

    Task<PtRefundFacts?> GetRefundFactsAsync(Guid invoiceItemId, Guid? relatedEntitlementId,
        CancellationToken cancellationToken = default);

    Task CancelByInvoiceItemAsync(Guid invoiceItemId, Guid? relatedEntitlementId, string reason, Guid actorUserId,
        CancellationToken cancellationToken = default);
}

public sealed record PtRefundFacts(Guid MemberId, int ReservedSessions, int ConsumedSessions, string Status);

public sealed record PtPurchaseRequest(Guid MemberId, Guid MemberPackageId, Guid CoachId, int FrequencyPerWeek);

/// <param name="PriceVersion">Phiên bản giá lúc báo giá; đổi giá sau preview thì checkout phải xác nhận lại.</param>
public sealed record PtPurchaseQuote(
    decimal PricePerSession,
    int TotalQuota,
    decimal TotalPrice,
    int FrequencyPerWeek,
    string PriceVersion);
