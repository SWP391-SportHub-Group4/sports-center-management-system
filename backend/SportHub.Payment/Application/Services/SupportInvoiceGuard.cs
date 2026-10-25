using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

public sealed class SupportInvoiceGuard(ISportHubDbContext db) : ISupportInvoiceGuard
{
    public async Task EnsureEligibleAsync(Guid memberId, Guid invoiceId, CancellationToken ct)
    {
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleOrDefaultAsync(i => i.InvoiceId == invoiceId && i.MemberId == memberId, ct);
        if (invoice is null || !await db.Set<Domain.Entities.Payment>().AnyAsync(p => p.InvoiceId == invoiceId
                && p.Method == PaymentMethod.VnPay && p.Status == PaymentStatus.Success, ct))
            throw new BadRequestException(PaymentSupportErrorCodes.PaymentRequestInvoiceRequired,
                "Choose a paid VNPay invoice of this member.");
        if (invoice.Status == InvoiceStatus.Compensated || invoice.ResolutionIdempotencyKey is not null)
            throw new ConflictException(PaymentSupportErrorCodes.ReconciliationAlreadyResolved,
                "This payment has already been resolved.");
        if (await db.Set<MemberSupportRequest>().AnyAsync(r => r.InvoiceId == invoiceId
                && r.Category == "PAYMENT" && r.Status != "CLOSED" && r.Status != "DONE"
                && r.Status != "REJECTED", ct))
            throw new ConflictException(PaymentSupportErrorCodes.PaymentRequestAlreadyOpen,
                "An open support request already exists for this invoice.");
        // A center cancellation is refunded either as points or through a Manager-handled request, never both.
        var pointsChosen = await (from l in db.Set<PointLedgerEntry>()
                                  join i in db.Set<InvoiceItem>() on l.InvoiceItemId equals i.ItemId
                                  where i.InvoiceId == invoiceId && l.ReferenceType == "SystemEvent"
                                      && l.EntryType == PointEntryType.Earn && l.Note != null
                                      && l.Note.StartsWith(CenterCancellationRefundService.NotePrefix)
                                  select l.LedgerEntryId).AnyAsync(ct);
        if (pointsChosen)
            throw new ConflictException("center_cancellation_points_chosen",
                "Points were already chosen for the center cancellation on this invoice, so a refund request cannot be sent.");
    }
}
