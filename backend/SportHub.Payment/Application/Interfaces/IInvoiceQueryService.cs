using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Interfaces;

public interface IInvoiceQueryService
{
    Task<Guid> FindInvoiceByItemAsync(Guid itemId, CancellationToken ct);
    Task<PagedResult<InvoiceSummaryResponse>> SearchAsync(
        Guid? memberId, string? status, string? keyword,
        int page, int pageSize, CancellationToken ct = default);

    Task<InvoiceDetailResponse> GetDetailAsync(Guid invoiceId, CancellationToken ct = default);

    Task<InvoiceBalance> GetBalanceAsync(Guid invoiceId, CancellationToken ct = default);
}
