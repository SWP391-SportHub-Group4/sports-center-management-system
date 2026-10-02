using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

public sealed class InvoiceQueryService(ISportHubDbContext db) : IInvoiceQueryService
{
    public async Task<Guid> FindInvoiceByItemAsync(Guid itemId, CancellationToken ct)
        => await db.Set<InvoiceItem>().AsNoTracking().Where(i => i.ItemId == itemId).Select(i => (Guid?)i.InvoiceId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("invoice_item_not_found", "Không tìm thấy sản phẩm hóa đơn.");

    private sealed record InvoiceRow(
        Guid InvoiceId,
        string InvoiceNumber,
        Guid MemberId,
        string MemberEmail,
        string MemberName,
        decimal TotalAmount,
        decimal GrossCollected,
        decimal ObligationReduction,
        decimal RefundedAmount,
        InvoiceStatus Status,
        DateTime IssuedAt,
        Guid? MemberPackageId,
        int PointsSpent,
        decimal CashAmount,
        [property: SportHub.BuildingBlocks.Api.WireEnum] string? PaidVia,
        DateTime? PaidAtUtc,
        DateTime? CheckoutExpiresAtUtc,
        bool ReconciliationRequired);

    public async Task<PagedResult<InvoiceSummaryResponse>> SearchAsync(
        Guid? memberId,
        string? status,
        string? keyword,
        int page,
        int pageSize,
        CancellationToken ct = default, bool rentalOnly = false)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var query = db.Set<Invoice>().AsNoTracking();
        if (rentalOnly)
            query = query.Where(i => i.Items.Any(item => item.ItemType == InvoiceItemType.Rental));

        if (memberId is not null)
        {
            query = query.Where(i => i.MemberId == memberId);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseStatus(status);
            query = query.Where(i => i.Status == parsed);
        }

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(i =>
                i.InvoiceNumber.ToLower().Contains(term)
                || i.Member!.Email.ToLower().Contains(term)
                || (i.Member.Profile != null && i.Member.Profile.FullName.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(ct);

        var rows = await query
            .OrderByDescending(i => i.IssuedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(RowProjection())
            .ToListAsync(ct);

        return new PagedResult<InvoiceSummaryResponse>
        {
            Items = [.. rows.Select(ToSummary)],
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<InvoiceDetailResponse> GetDetailAsync(Guid invoiceId, CancellationToken ct = default)
    {
        var row = await db.Set<Invoice>()
                      .AsNoTracking()
                      .Where(i => i.InvoiceId == invoiceId)
                      .Select(RowProjection())
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");

        var items = await db.Set<InvoiceItem>()
            .AsNoTracking()
            .Where(it => it.InvoiceId == invoiceId)
            .Select(it => new InvoiceItemResponse(
                it.ItemId, it.ItemType.ToString(), it.Description, it.UnitPrice, it.Quantity, it.LineAmount,
                it.RelatedEntityId, it.ClassId, it.CourtRentalId, it.PtEntitlementId, it.MemberPackageId,
                it.SportId, it.SportNameSnapshot, it.PtFrequencyPerWeek, it.SourceInvoiceItemId))
            .ToListAsync(ct);

        var payments = await db.Set<Domain.Entities.Payment>()
            .AsNoTracking()
            .Where(p => p.InvoiceId == invoiceId)
            .OrderBy(p => p.PaidAt)
            .Select(p => new PaymentResponse(
                p.PaymentId, p.Amount, p.Method.ToString(), p.Status.ToString(), p.ReferenceCode,
                p.ReceivedByUserId,
                p.ReceivedByUser!.Profile != null ? p.ReceivedByUser.Profile.FullName : p.ReceivedByUser.Email,
                p.PaidAt))
            .ToListAsync(ct);

        var adjustments = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(a => a.InvoiceId == invoiceId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(AdjustmentProjection())
            .ToListAsync(ct);

        // Retained for legacy response compatibility. Refund suggestions now come from the
        // item-scoped /api/refunds workflow and are expressed in points.
        const decimal suggestedRefund = 0m;
        return new InvoiceDetailResponse(
            ToSummary(row), row.MemberPackageId, items, payments, adjustments, suggestedRefund);
    }

    public async Task<InvoiceBalance> GetBalanceAsync(Guid invoiceId, CancellationToken ct = default)
    {
        var row = await db.Set<Invoice>()
                      .AsNoTracking()
                      .Where(i => i.InvoiceId == invoiceId)
                      .Select(RowProjection())
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");

        return new InvoiceBalance(row.TotalAmount, row.GrossCollected + row.PointsSpent * 1000m,
            row.ObligationReduction, row.RefundedAmount);
    }

    private static InvoiceSummaryResponse ToSummary(InvoiceRow row)
    {
        var balance = new InvoiceBalance(row.TotalAmount, row.GrossCollected + row.PointsSpent * 1000m,
            row.ObligationReduction, row.RefundedAmount);

        return new InvoiceSummaryResponse(
            row.InvoiceId,
            row.InvoiceNumber,
            row.MemberId,
            row.MemberEmail,
            row.MemberName,
            row.TotalAmount,
            row.GrossCollected,
            balance.ObligationReduction,
            balance.RefundedAmount,
            balance.NetCollected,
            balance.NetPayable,
            balance.Outstanding,
            balance.RefundDue,
            row.Status.ToString(),
            row.IssuedAt,
            row.PointsSpent, row.CashAmount, row.PaidVia, row.PaidAtUtc,
            row.CheckoutExpiresAtUtc, row.ReconciliationRequired);
    }

    private static System.Linq.Expressions.Expression<Func<Invoice, InvoiceRow>> RowProjection()
        => i => new InvoiceRow(
            i.InvoiceId,
            i.InvoiceNumber,
            i.MemberId,
            i.Member!.Email,
            i.Member.Profile != null ? i.Member.Profile.FullName : string.Empty,
            i.TotalAmount,

            i.Payments.Where(p => p.Status == PaymentStatus.Success).Sum(p => (decimal?)p.Amount) ?? 0m,

            i.Adjustments
                .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                            && a.Type != PaymentAdjustmentType.Refund)
                .Sum(a => (decimal?)a.Amount) ?? 0m,

            i.Adjustments
                .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                            && a.Type == PaymentAdjustmentType.Refund)
                .Sum(a => (decimal?)a.Amount) ?? 0m,
            i.Status,
            i.IssuedAt,
            i.MemberPackageId,
            i.Status == InvoiceStatus.Paid && i.CheckoutCycleId != null ? i.PointsApplied : 0,
            i.CashAmount,
            i.PaidVia,
            i.PaidAtUtc,
            i.HoldExpiresAtUtc,
            i.ReconciliationRequired);

    internal static System.Linq.Expressions.Expression<Func<PaymentAdjustment, PaymentAdjustmentResponse>>
        AdjustmentProjection()
        => a => new PaymentAdjustmentResponse(
            a.AdjustmentId,
            a.InvoiceId,
            a.Invoice!.InvoiceNumber,
            a.PaymentId,
            a.Type.ToString(),
            a.Amount,
            a.RequestedAmount,
            a.Reason,
            a.Status.ToString(),
            a.RequestedByUserId,
            a.RequestedByUser!.Profile != null ? a.RequestedByUser.Profile.FullName : a.RequestedByUser.Email,
            a.ApprovedByUserId,
            a.ApprovedByUser == null
                ? null
                : a.ApprovedByUser.Profile != null ? a.ApprovedByUser.Profile.FullName : a.ApprovedByUser.Email,
            a.CompletedByUserId,
            a.CompletedByUser == null
                ? null
                : a.CompletedByUser.Profile != null ? a.CompletedByUser.Profile.FullName : a.CompletedByUser.Email,
            a.RefundMethod == null ? null : a.RefundMethod.ToString(),
            a.RefundReferenceCode,
            a.CreatedAt,
            a.ApprovedAtUtc,
            a.CompletedAtUtc,

            a.Type == PaymentAdjustmentType.Refund && a.Status == PaymentAdjustmentStatus.Approved,
            a.ResolvedAt,
            a.InvoiceItemId,
            a.SystemCalculatedPoints,
            a.ApprovedPoints,
            a.PointLedgerEntryId,
            a.CenterFault);

    private static InvoiceStatus ParseStatus(string status)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<InvoiceStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", $"Trạng thái hóa đơn không hợp lệ: '{status}'.");
}
