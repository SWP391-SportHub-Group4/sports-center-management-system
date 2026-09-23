using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Interfaces;

/// <summary>
/// BR-30 — kích hoạt gói khi nghĩa vụ hoá đơn đã được thoả, dù bằng đường thu tiền hay
/// đường giảm nghĩa vụ (Discount/Correction được duyệt).
/// </summary>
public interface IPackageActivationService
{
    Task ActivateIfObligationMetAsync(
        Invoice invoice, InvoiceBalance balance, Guid actorUserId, CancellationToken ct = default);
}
