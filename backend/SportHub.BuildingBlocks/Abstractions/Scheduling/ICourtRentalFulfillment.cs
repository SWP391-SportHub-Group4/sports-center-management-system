namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Quyền lợi thuê sân của Member, do Scheduling sở hữu. Bản cài đặt ở Scheduling/Rental.
/// Cùng transaction với caller; không SaveChanges/commit riêng.
/// </summary>
public interface ICourtRentalFulfillment
{
    /// <summary>Tính giá từng khối 60 phút theo khung giá và kiểm điều kiện; không giữ chỗ.</summary>
    Task<CourtRentalQuote> QuoteAsync(CourtRentalRequest request, CancellationToken cancellationToken = default);

    /// <summary>Tạo CourtRental PendingPayment và chiếm room (không chiếm Coach) đến <paramref name="holdExpiresAtUtc"/>.</summary>
    Task<Guid> ReserveAsync(Guid invoiceId, CourtRentalRequest request, DateTimeOffset holdExpiresAtUtc,
        CourtRentalQuote quotedPrice, CancellationToken cancellationToken = default);

    /// <summary>PendingPayment sang Confirmed, gắn InvoiceItem. Idempotent.</summary>
    Task ConfirmAsync(Guid courtRentalId, Guid invoiceItemId, CancellationToken cancellationToken = default);

    /// <summary>Hết hạn/hủy thanh toán: nhả occupancy đúng một lần.</summary>
    Task ReleaseAsync(Guid courtRentalId, CancellationToken cancellationToken = default);

    Task CancelAsync(Guid courtRentalId, string reason, bool centerFault = false,
        Guid? incidentId = null, CancellationToken cancellationToken = default);

    Task<CourtRentalRequest> GetForRetryAsync(Guid courtRentalId, CancellationToken cancellationToken = default);
    Task<CourtRentalRefundFacts?> GetRefundFactsAsync(Guid invoiceItemId, CancellationToken cancellationToken = default);
    Task<bool> ReacquireForLatePaymentAsync(Guid courtRentalId, DateTimeOffset newHoldExpiresAtUtc,
        CancellationToken cancellationToken = default);
}

public sealed record CourtRentalRefundFacts(Guid RentalId, Guid OwnerId, DateTimeOffset StartUtc,
    string Status, bool IsCancelledByCenter);

public sealed record CourtRentalRequest(
    Guid MemberId,
    int SportId,
    int RoomId,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc);

public sealed record CourtRentalBlockPrice(DateTimeOffset StartUtc, DateTimeOffset EndUtc, decimal Price);

public sealed record CourtRentalQuote(decimal TotalPrice, IReadOnlyList<CourtRentalBlockPrice> Blocks);
