namespace SportHub.BuildingBlocks.Abstractions.Payment;

/// <summary>
/// Tầng thấp chỉ tạo Invoice + items từ snapshot đã kiểm. Bản cài đặt ở Payment.
/// Không gọi lại fulfillment của module nào, để Scheduling dùng được (hóa đơn chênh chuyển lớp,
/// thuê sân) mà không sinh vòng DI. Cùng transaction caller, không SaveChanges.
/// </summary>
public interface IInvoiceDraftWriter
{
    Task<InvoiceDraftResult> CreateAsync(InvoiceDraft draft, CancellationToken cancellationToken = default);
}

public sealed record InvoiceDraft(
    Guid BeneficiaryUserId,
    Guid InitiatedByUserId,
    IReadOnlyList<InvoiceDraftItem> Items,
    DateTimeOffset HoldExpiresAtUtc,
    string IdempotencyKey);

/// <param name="ItemType">Membership / PtPackage / ClassEnrollment / ClassTransferDifference / CourtRental.</param>
public sealed record InvoiceDraftItem(
    string ItemType,
    string Description,
    decimal Amount,
    int? SportId = null,
    int? ClassId = null,
    Guid? CourtRentalId = null,
    Guid? PtEntitlementId = null,
    Guid? MemberPackageId = null,
    Guid? SourceEnrollmentId = null,
    Guid? SourceInvoiceItemId = null,
    Guid? RelatedEntityId = null,
    Guid? ResourceHoldId = null);

public sealed record InvoiceDraftResult(Guid InvoiceId, IReadOnlyList<Guid> InvoiceItemIds);
