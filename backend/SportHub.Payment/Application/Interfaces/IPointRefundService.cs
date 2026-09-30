using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Payment.Application.Commands.Refunds;
using SportHub.Payment.Application.DTOs;

namespace SportHub.Payment.Application.Interfaces;

public interface IPointRefundService
{
    Task<PagedResult<PaymentAdjustmentResponse>> SearchAsync(string? status, Guid? invoiceId,
        Guid? invoiceItemId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<PaymentAdjustmentResponse> RequestAsync(Guid invoiceItemId, string reason, Guid actorUserId,
        bool canRequestForAnotherUser, CancellationToken cancellationToken = default);
    Task<PaymentAdjustmentResponse> ApproveAsync(Guid adjustmentId, ApprovePointRefundRequest request,
        Guid managerUserId, CancellationToken cancellationToken = default);
    Task<PaymentAdjustmentResponse> RejectAsync(Guid adjustmentId, string reason, Guid managerUserId,
        CancellationToken cancellationToken = default);
}
