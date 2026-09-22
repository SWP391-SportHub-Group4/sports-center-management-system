using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Interfaces;

public interface IPaymentAdjustmentService
{
    Task<PagedResult<PaymentAdjustmentResponse>> SearchAsync(
        string? status, Guid? invoiceId, int page, int pageSize, CancellationToken ct = default);

    Task<PaymentAdjustmentResponse> RequestAsync(
        Guid invoiceId, CreateAdjustmentRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<PaymentAdjustmentResponse> ApproveAsync(
        Guid adjustmentId, ApproveAdjustmentRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<PaymentAdjustmentResponse> RejectAsync(
        Guid adjustmentId, string reason, Guid actorUserId, CancellationToken ct = default);
}
