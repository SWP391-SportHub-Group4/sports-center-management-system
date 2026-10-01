using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Infrastructure;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Application.Services;

/// <summary>Creates an issued invoice from a validated cross-module snapshot in the caller's transaction.</summary>
public sealed class InvoiceDraftWriter(ISportHubDbContext db, IInvoiceNumberGenerator numbers, IClock clock)
    : IInvoiceDraftWriter
{
    public async Task<InvoiceDraftResult> CreateAsync(InvoiceDraft draft, CancellationToken cancellationToken = default)
    {
        if (draft.BeneficiaryUserId == Guid.Empty || draft.InitiatedByUserId == Guid.Empty
            || string.IsNullOrWhiteSpace(draft.IdempotencyKey) || draft.IdempotencyKey.Length > 120
            || draft.Items.Count != 1 || draft.HoldExpiresAtUtc <= clock.UtcNow)
            throw new BadRequestException("invalid_invoice_draft", "Invoice draft phải có một item, actor, key và hạn giữ hợp lệ.");
        var itemDraft = draft.Items[0];
        if (itemDraft.Amount <= 0 || itemDraft.Amount % 1_000 != 0)
            throw new BadRequestException("invalid_invoice_draft_amount", "Invoice draft phải dương và là bội số 1.000 VND.");
        var itemType = itemDraft.ItemType switch
        {
            "Membership" => InvoiceItemType.Membership,
            "PtPackage" => InvoiceItemType.PT,
            "ClassEnrollment" => InvoiceItemType.ClassPackage,
            "ClassTransferDifference" => InvoiceItemType.ClassTransferDifference,
            "CourtRental" => InvoiceItemType.Rental,
            _ => throw new BadRequestException("invalid_invoice_draft_type", "Loại InvoiceItem draft không hợp lệ.")
        };

        var now = clock.UtcNow;
        var cycleId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var invoice = new Invoice
        {
            InvoiceId = invoiceId,
            InvoiceNumber = await numbers.NextAsync(now, cancellationToken),
            MemberId = draft.BeneficiaryUserId,
            IssuedByUserId = draft.InitiatedByUserId,
            TotalAmount = itemDraft.Amount,
            CashAmount = itemDraft.Amount,
            CheckoutCycleId = cycleId,
            CheckoutRevision = 1,
            HoldExpiresAtUtc = draft.HoldExpiresAtUtc.UtcDateTime,
            Status = InvoiceStatus.Issued,
            IssuedAt = now
        };
        db.Set<Invoice>().Add(invoice);
        db.Set<InvoiceItem>().Add(new InvoiceItem
        {
            ItemId = itemId,
            InvoiceId = invoiceId,
            ItemType = itemType,
            Description = itemDraft.Description,
            UnitPrice = itemDraft.Amount,
            Quantity = 1,
            LineAmount = itemDraft.Amount,
            RelatedEntityId = itemDraft.RelatedEntityId,
            SourceInvoiceItemId = itemDraft.SourceInvoiceItemId,
            ClassId = itemDraft.ClassId, CourtRentalId = itemDraft.CourtRentalId,
            PtEntitlementId = itemDraft.PtEntitlementId, MemberPackageId = itemDraft.MemberPackageId,
            SportId = itemDraft.SportId, SportNameSnapshot = itemDraft.SportName
        });
        db.Set<CheckoutSession>().Add(new CheckoutSession
        {
            CheckoutSessionId = cycleId,
            InvoiceId = invoiceId,
            Revision = 1,
            IdempotencyKey = draft.IdempotencyKey,
            Kind = itemType == InvoiceItemType.ClassTransferDifference ? "ClassTransfer" : itemDraft.ItemType,
            State = "Active",
            CreatedAtUtc = now,
            ExpiresAtUtc = draft.HoldExpiresAtUtc.UtcDateTime,
            ResourceHoldId = itemDraft.ResourceHoldId,
            ClassId = itemDraft.ClassId
        });
        return new InvoiceDraftResult(invoiceId, [itemId]);
    }
}
