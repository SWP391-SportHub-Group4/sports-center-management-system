namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Quyền lợi ghi danh lớp theo khóa, do Scheduling sở hữu. Bản cài đặt ở Scheduling.
/// Giá và quyền sở hữu chỗ thuộc Scheduling; quyết định "đã trả tiền" thuộc Payment (caller).
/// Mọi hàm chạy trong transaction của caller, không SaveChanges/commit riêng khi caller đã mở transaction.
/// </summary>
public interface IClassEnrollmentFulfillment
{
    /// <summary>Giá và điều kiện hiện tại; không giữ chỗ. Lỗi nghiệp vụ ném AppException (mã ổn định).</summary>
    Task<ClassQuote> QuoteAsync(int classId, Guid memberId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Khóa Member, tăng ReservedCount có điều kiện (UPDATE ... WHERE reserved_count &lt; capacity) và tạo SeatHold Active đến
    /// <paramref name="holdExpiresAtUtc"/>. Hết chỗ: 409 <c>class_full</c>.
    /// </summary>
    Task<ClassSeatReservation> ReserveAsync(
        int classId, Guid memberId, Guid? invoiceId, DateTimeOffset holdExpiresAtUtc,
        CancellationToken cancellationToken = default, Guid? transferSourceEnrollmentId = null);

    /// <summary>Hold thành Enrollment Confirmed gắn InvoiceItem. Idempotent theo <paramref name="invoiceItemId"/>.</summary>
    Task<Guid> ConfirmAsync(Guid seatHoldId, Guid invoiceItemId, CancellationToken cancellationToken = default,
        Guid? sourceEnrollmentId = null, Guid? transferDifferenceInvoiceItemId = null);

    Task AttachHoldToInvoiceAsync(Guid seatHoldId, Guid invoiceId, CancellationToken cancellationToken = default);

    Task CompleteTransferAsync(Guid thresholdResponseId, Guid seatHoldId, Guid differenceInvoiceItemId,
        CancellationToken cancellationToken = default);

    /// <summary>Nhả chỗ giữ đúng một lần; gọi lại (hoặc hold đã hết hạn) không giảm hai lần.</summary>
    Task ReleaseAsync(Guid seatHoldId, CancellationToken cancellationToken = default);

    /// <summary>Kết thúc quyền lợi của item đã trả (hoàn tiền/hủy lớp/chuyển lớp): đổi trạng thái ghi danh, giảm counts. Idempotent.</summary>
    Task CancelAsync(Guid invoiceItemId, EnrollmentEndReason endReason, CancellationToken cancellationToken = default);

    Task<ClassRefundFacts?> GetRefundFactsAsync(Guid invoiceItemId, CancellationToken cancellationToken = default);
}

/// <summary>Lý do kết thúc một ghi danh Confirmed (map sang EnrollmentStatus).</summary>
public enum EnrollmentEndReason
{
    Refunded,
    CancelledByCenter,
    TransferredOut
}

public sealed record ClassQuote(int ClassId, int SportId, string SportName, decimal Price, DateTimeOffset FirstSessionUtc);

public sealed record ClassSeatReservation(Guid SeatHoldId, ClassQuote Quote);

public sealed record ClassRefundFacts(Guid MemberId, DateTimeOffset FirstSessionUtc,
    int TotalProvidedSessions, int SessionsNotProvided, bool EnrollmentActive);
