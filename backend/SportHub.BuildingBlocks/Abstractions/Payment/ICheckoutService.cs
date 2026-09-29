using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.BuildingBlocks.Abstractions.Payment;

/// <summary>
/// Orchestration checkout (Membership/PT/Lớp/Thuê sân). Bản cài đặt ở Payment; controller gọi.
/// Giá luôn do backend tính qua các port quote/reserve; request không mang giá.
/// Cùng <see cref="CheckoutCommand.IdempotencyKey"/> và payload trả lại checkout cũ.
/// Không giữ DB transaction khi gọi cổng thanh toán hay SMTP.
/// </summary>
public interface ICheckoutService
{
    Task<CheckoutResult> CheckoutMembershipAsync(CheckoutCommand command, int packageId, CancellationToken cancellationToken = default);

    Task<CheckoutResult> CheckoutClassAsync(CheckoutCommand command, int classId, CancellationToken cancellationToken = default);

    Task<CheckoutResult> CheckoutPtAsync(CheckoutCommand command, Guid coachId, int frequencyPerWeek, string? expectedPriceVersion, CancellationToken cancellationToken = default);

    Task<CheckoutResult> CheckoutCourtRentalAsync(CheckoutCommand command, CourtRentalRequest rental, CancellationToken cancellationToken = default);
}

/// <param name="ActorUserId">Từ JWT.</param>
/// <param name="BeneficiaryUserId">Người nhận quyền lợi. Khác Actor chỉ khi Receptionist thanh toán thay tại quầy.</param>
/// <param name="PointsRequested">Số điểm muốn dùng; điểm chỉ được Hold sau khi xác nhận (OTP tại quầy).</param>
public sealed record CheckoutCommand(
    Guid ActorUserId,
    Guid BeneficiaryUserId,
    string IdempotencyKey,
    int PointsRequested);

/// <param name="Status">Trạng thái Invoice.</param>
/// <param name="PaymentUrl">Null khi 100% điểm hoặc khi đang chờ xác nhận điểm.</param>
public sealed record CheckoutResult(
    Guid InvoiceId,
    string Status,
    decimal TotalAmount,
    decimal CashAmount,
    int PointsApplied,
    DateTimeOffset? HoldExpiresAtUtc,
    string? PaymentUrl);
