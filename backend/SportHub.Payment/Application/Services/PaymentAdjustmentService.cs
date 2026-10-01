using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Application.Services;

/// <summary>Historical adjustments remain readable; new refunds use the item-scoped point workflow.</summary>
public sealed class PaymentAdjustmentService(ISportHubDbContext db) : IPaymentAdjustmentService
{
    public async Task<PagedResult<PaymentAdjustmentResponse>> SearchAsync(
        string? status,
        Guid? invoiceId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var query = db.Set<PaymentAdjustment>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseStatus(status);
            query = query.Where(a => a.Status == parsed);
        }

        if (invoiceId is not null)
        {
            query = query.Where(a => a.InvoiceId == invoiceId);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(InvoiceQueryService.AdjustmentProjection())
            .ToListAsync(ct);

        return new PagedResult<PaymentAdjustmentResponse>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public Task<PaymentAdjustmentResponse> RequestAsync(Guid invoiceId, CreateAdjustmentRequest request,
        Guid actorUserId, CancellationToken ct = default)
    {
        if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<PaymentAdjustmentType>(request.Type, true, out var type) || !Enum.IsDefined(type))
            throw new BadRequestException("invalid_adjustment_type", "Loại điều chỉnh không hợp lệ.");
        throw new ConflictException(type == PaymentAdjustmentType.Refund ? "refund_use_point_workflow" : "legacy_adjustment_read_only",
            "Điều chỉnh legacy chỉ dùng để đọc lịch sử. Hoàn điểm mới phải dùng InvoiceItem qua /api/refunds.");
    }

    public async Task<PaymentAdjustmentResponse> ApproveAsync(Guid adjustmentId, ApproveAdjustmentRequest request,
        Guid actorUserId, CancellationToken ct = default)
    {
        var adjustment = await db.Set<PaymentAdjustment>().AsNoTracking().SingleOrDefaultAsync(x => x.AdjustmentId == adjustmentId, ct)
            ?? throw new NotFoundException("adjustment_not_found", "Không tìm thấy yêu cầu điều chỉnh.");
        throw new ConflictException(adjustment.Type == PaymentAdjustmentType.Refund ? "legacy_refund_not_approvable" : "legacy_adjustment_read_only",
            "Điều chỉnh legacy không được dùng để thay đổi nghĩa vụ hoặc kích hoạt quyền lợi mới.");
    }

    public Task<PaymentAdjustmentResponse> RejectAsync(Guid adjustmentId, string reason, Guid actorUserId,
        CancellationToken ct = default)
        => throw new ConflictException("legacy_adjustment_read_only", "Điều chỉnh legacy chỉ dùng để đọc lịch sử.");

    private static PaymentAdjustmentStatus ParseStatus(string status)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<PaymentAdjustmentStatus>(status, true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed : throw new BadRequestException("invalid_status", $"Trạng thái điều chỉnh không hợp lệ: '{status}'.");
}
