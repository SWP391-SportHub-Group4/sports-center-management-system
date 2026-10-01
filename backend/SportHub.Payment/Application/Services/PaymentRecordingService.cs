using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Application.Services;

/// <summary>Compatibility endpoint: historical payments are readable, but all new cash requires gateway proof.</summary>
public sealed class PaymentRecordingService : IPaymentRecordingService
{
    public Task<InvoiceDetailResponse> RecordAsync(Guid invoiceId, RecordPaymentRequest request,
        Guid actorUserId, CancellationToken ct = default)
        => throw new ConflictException("checkout_requires_verified_payment",
            "Không ghi nhận tiền thủ công, kể cả hóa đơn legacy. Hãy tạo checkout và xác minh qua VNPay.");
}
