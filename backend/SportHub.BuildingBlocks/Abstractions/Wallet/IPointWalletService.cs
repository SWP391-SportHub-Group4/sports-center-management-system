namespace SportHub.BuildingBlocks.Abstractions.Wallet;

/// <summary>
/// Ví điểm (1 điểm = 1.000 VND). Bản cài đặt ở Payment/Wallet.
///
/// Số điểm nguyên. Mọi thao tác khóa ví và kiểm số dư trong transaction của caller, không tự
/// commit. Idempotent theo (OwnerUserId, ReferenceType, ReferenceId): gọi lại cùng khóa và cùng
/// payload trả kết quả cũ (<see cref="WalletResult.AlreadyApplied"/>); khác payload ném
/// <see cref="WalletReferenceConflictException"/>.
/// </summary>
public interface IPointWalletService
{
    /// <summary>Tạo ví số dư 0 nếu chưa có.</summary>
    Task EnsureWalletAsync(Guid ownerUserId, CancellationToken cancellationToken = default);

    /// <summary>available −p, held +p. Thiếu điểm ném <see cref="InsufficientPointsException"/>.</summary>
    Task<WalletResult> HoldAsync(WalletOperation operation, CancellationToken cancellationToken = default);

    /// <summary>held −p, available +p.</summary>
    Task<WalletResult> ReleaseAsync(WalletOperation operation, CancellationToken cancellationToken = default);

    /// <summary>held −p (điểm đã tiêu).</summary>
    Task<WalletResult> SpendAsync(WalletOperation operation, CancellationToken cancellationToken = default);

    /// <summary>available +p (hoàn/bồi hoàn).</summary>
    Task<WalletResult> EarnAsync(WalletOperation operation, CancellationToken cancellationToken = default);

    /// <summary>Manager điều chỉnh; không trừ vào điểm đang hold.</summary>
    Task<WalletResult> AdjustAsync(WalletAdjustment adjustment, CancellationToken cancellationToken = default);
}

/// <param name="ReferenceType">Loại sự kiện gốc (CheckoutSession, PaymentAdjustment, GatewayEvent...).</param>
/// <param name="ReferenceId">ID sự kiện gốc; cùng ví + loại + ID chỉ áp dụng một lần.</param>
public sealed record WalletOperation(
    Guid OwnerUserId,
    int Points,
    string ReferenceType,
    Guid ReferenceId,
    Guid? ActorUserId = null,
    string? Note = null);

public enum WalletAdjustmentDirection
{
    Credit,
    Debit
}

public sealed record WalletAdjustment(
    Guid OwnerUserId,
    int Points,
    WalletAdjustmentDirection Direction,
    string ReferenceType,
    Guid ReferenceId,
    Guid ActorUserId,
    string Reason);

public sealed record WalletResult(bool AlreadyApplied, int AvailableAfter, int HeldAfter, Guid LedgerEntryId);

public sealed class InsufficientPointsException(int requested, int available)
    : Exception($"Không đủ điểm: cần {requested}, khả dụng {available}.")
{
    public int Requested { get; } = requested;
    public int Available { get; } = available;
}

public sealed class WalletReferenceConflictException(string referenceType, Guid referenceId)
    : Exception($"Tham chiếu {referenceType}/{referenceId} đã dùng với nội dung khác.");
