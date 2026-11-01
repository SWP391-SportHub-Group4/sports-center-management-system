using SportHub.Membership.Application.Services;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Rules;


using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Infrastructure;

namespace SportHub.Payment.Application.Services;

public sealed class PackagePurchaseService(
    ISportHubDbContext db,
    IInvoiceNumberGenerator invoiceNumbers,
    IUserAccessReader users, IMembershipFulfillment memberships, PaymentNoticeService notices,
    IInvoiceQueryService invoiceQuery,
    IAuditWriter audit,
    ISystemSettingProvider settings,
    IClock clock) : IPackagePurchaseService
{
    public async Task<InvoiceDetailResponse> PurchaseAsync(
        PurchasePackageRequest request,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct = default,
        string? idempotencyKey = null)
    {
        var member = await users.GetAsync(request.MemberId, ct)
            ?? throw new NotFoundException("member_not_found", "Member not found.");
        if (member.Role != "Member") throw new BadRequestException("not_a_member", "Not a member.");
        if (!member.IsActive) throw new ConflictException("member_not_active", "Member not active.");
        // A front-desk invitation is marked Active before the member sets a password.
        // A password or linked external login is required before any package purchase.
        if (!await db.Set<SportHub.Identity.Domain.Entities.UserAccount>().AsNoTracking()
            .AnyAsync(u => u.UserId == request.MemberId
                && ((u.Credential != null && u.Credential.PasswordHash != null)
                    || u.ExternalLogins.Any()), ct))
            throw new ConflictException("member_not_activated", "Member must activate the account before purchasing a package.");
        var catalog = await memberships.QuoteAsync(request.PackageId, ct);
        if (request.PackageId == DayPass.PackageId && !DayPassClock.IsOpen(clock.UtcNow, await CenterOperatingHours.ReadAsync(settings, ct)))
            throw new ConflictException(PaymentSupportErrorCodes.DayPassOutsideHours,
                "Gym day passes can be purchased only from 06:00 until 22:00 Vietnam time.");
        if (request.AllowStacking)
        {
            if (!actorIsCenterManager)
            {
                throw new ForbiddenException(
                    "stacking_requires_manager",
                    "Stacking requires manager.");
            }

            if (string.IsNullOrWhiteSpace(request.StackingApprovalReason))
            {
                throw new BadRequestException(
                    "stacking_reason_required", "Stacking reason required.");
            }
        }
        var now = clock.UtcNow;
        var holdMinutes = await CheckoutHoldPolicy.ReadMinutesAsync(settings, ct);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await DayPassHoursLock.AcquireAsync(db, ct: ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {request.MemberId} FOR UPDATE", ct);
        var lockedMember = await users.GetAsync(request.MemberId, ct);
        if (lockedMember is null || lockedMember.Role != "Member" || !lockedMember.IsActive)
            throw new ConflictException("member_not_active", "Member not active.");
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var existing = await db.Set<CheckoutSession>().AsNoTracking()
                .Where(x => x.IdempotencyKey == idempotencyKey && x.Kind == "Membership"
                    && x.ExpiresAtUtc > now)
                .Join(db.Set<Invoice>(), s => s.InvoiceId, i => i.InvoiceId,
                    (s, i) => new { s.InvoiceId, i.MemberId, i.MemberPackageId })
                .SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                if (existing.MemberId != request.MemberId || (await memberships.GetAsync(existing.MemberPackageId!.Value, ct)).PackageId != request.PackageId)
                    throw new ConflictException("idempotency_key_reused", "Idempotency key reused.");
                await transaction.CommitAsync(ct);
                return await invoiceQuery.GetDetailAsync(existing.InvoiceId, ct);
            }
        }
        // Returning to the Gym catalog supplies a new client key. Reuse an unpaid
        // checkout for the same plan while its original hold is still valid.
        if (!request.AllowStacking && !string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var resumableInvoiceId = await db.Set<CheckoutSession>().AsNoTracking()
                .Where(s => s.Kind == "Membership" && s.State == "Active" && s.ExpiresAtUtc > now)
                .Join(db.Set<Invoice>().AsNoTracking(), s => s.InvoiceId, i => i.InvoiceId,
                    (s, i) => new { Session = s, Invoice = i })
                .Join(db.Set<SportHub.Membership.Domain.Entities.MemberPackage>().AsNoTracking(),
                    x => x.Invoice.MemberPackageId, p => (Guid?)p.MemberPackageId,
                    (x, p) => new { x.Session, x.Invoice, Package = p })
                .Where(x => x.Invoice.MemberId == request.MemberId && x.Package.PackageId == request.PackageId
                    && x.Invoice.Status == InvoiceStatus.Issued
                    && x.Invoice.CheckoutCycleId == x.Session.CheckoutSessionId
                    && !x.Invoice.ReconciliationRequired)
                .OrderByDescending(x => x.Session.CreatedAtUtc)
                .Select(x => (Guid?)x.Invoice.InvoiceId)
                .FirstOrDefaultAsync(ct);
            if (resumableInvoiceId is Guid activeInvoiceId)
            {
                await transaction.CommitAsync(ct);
                return await invoiceQuery.GetDetailAsync(activeInvoiceId, ct);
            }
        }
        var memberPackageId = await memberships.PrepareAsync(request.MemberId, request.PackageId,
            actorUserId, request.AllowStacking, request.StackingApprovalReason, ct);
        var expiry = now.AddMinutes(holdMinutes);
        if (request.PackageId == DayPass.PackageId)
        {
            var closes = DayPassClock.ClosesAtUtc(now, await CenterOperatingHours.ReadAsync(settings, ct));
            if (expiry > closes) expiry = closes;
        }
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(),
            InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = request.MemberId,
            IssuedByUserId = actorUserId,
            MemberPackageId = memberPackageId,
            TotalAmount = catalog.Price,
            CheckoutCycleId = Guid.NewGuid(),
            CheckoutRevision = 1,
            HoldExpiresAtUtc = expiry,
            CashAmount = catalog.Price,
            Status = InvoiceStatus.Issued,
            IssuedAt = now
        };

        db.Set<Invoice>().Add(invoice);
        if (idempotencyKey is not null) db.Set<CheckoutSession>().Add(new CheckoutSession
        {
            CheckoutSessionId = invoice.CheckoutCycleId!.Value, InvoiceId = invoice.InvoiceId,
            Revision = 1, Kind = "Membership", State = "Active",
            IdempotencyKey = idempotencyKey,
            CreatedAtUtc = now, ExpiresAtUtc = invoice.HoldExpiresAtUtc!.Value
        });

        var invoiceItem = new InvoiceItem
        {
            ItemId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            ItemType = InvoiceItemType.Membership,
            Description = $"Package {catalog.Name} ({catalog.DurationDays} days"
                          + (catalog.SessionLimit is null ? ", unlimited sessions)" : $", {catalog.SessionLimit} sessions)"),
            UnitPrice = catalog.Price,
            Quantity = 1,
            LineAmount = catalog.Price,
            RelatedEntityId = memberPackageId, MemberPackageId = memberPackageId
        };
        db.Set<InvoiceItem>().Add(invoiceItem);
        await notices.CreatedAsync(invoice, ct, invoiceItem.Description);

        audit.Write(new AuditEntry(
            actorUserId,
            "ISSUE_PACKAGE_INVOICE",
            nameof(Invoice),
            invoice.InvoiceId.ToString(),
            NewValue: $"{{\"invoiceNumber\":\"{invoice.InvoiceNumber}\",\"memberId\":\"{request.MemberId}\","
                      + $"\"packageId\":{catalog.PackageId},\"totalAmount\":{invoice.TotalAmount},"
                      + $"\"allowStacking\":{request.AllowStacking.ToString().ToLowerInvariant()}}}",
            Reason: request.AllowStacking ? request.StackingApprovalReason!.Trim() : null));

        await db.SaveChangesAsync(ct);
        await memberships.AttachItemAsync(memberPackageId, invoiceItem.ItemId, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoice.InvoiceId, ct);
    }

}

