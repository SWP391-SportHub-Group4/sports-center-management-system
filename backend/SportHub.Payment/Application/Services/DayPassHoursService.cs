using SportHub.Membership.Application.Services;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Payment.Application.Services;

public sealed class DayPassHoursService(ISportHubDbContext db, ISystemSettingProvider settings,
    PaymentFulfillmentService fulfillment, IClock clock) : IDayPassHoursUpdater
{
    // Stored internally; exposed to clients as the existing Expired state.
    public const string ClosedState = "ExpiredByClosing";

    public async Task ApplyAsync(int openingMinute, int closingMinute, CancellationToken ct = default)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Changing day-pass hours requires the settings transaction.");
        var now = clock.UtcNow;
        var today = VietnamTime.TodayLocal(clock);
        var hours = new CenterOperatingHours(openingMinute, closingMinute);
        var closes = DayPassClock.ClosesAtUtc(now, hours);
        // A paid pass waiting for today's opening remains Active; access/check-in separately
        // enforce the opening boundary so it becomes usable when the opening time arrives.
        var status = now < closes ? MemberPackageStatus.Active : MemberPackageStatus.Expired;
        // Active/Expired are time-based states. Re-evaluate today's paid passes, but never restore
        // cancelled, unpaid, compensated or refunded purchases, or passes from another day.
        await db.Set<MemberPackage>().Where(p => p.PackageId == DayPass.PackageId
            && (p.Status == MemberPackageStatus.Active || p.Status == MemberPackageStatus.Expired)
            && p.StartDate == today && p.EndDate == today
            && db.Set<Invoice>().Any(i => i.MemberPackageId == p.MemberPackageId
                && (i.Status == InvoiceStatus.Paid || i.Status == InvoiceStatus.PaidAfterReconciliation
                    && i.PaidVia == "VnPayAfterReconciliation")
                && !i.ReconciliationRequired
                && !db.Set<PaymentAdjustment>().Any(a => a.InvoiceId == i.InvoiceId
                    && a.Type == PaymentAdjustmentType.Refund && a.Status == PaymentAdjustmentStatus.Completed)
                && !db.Set<MemberSupportPayout>().Any(payout => payout.InvoiceId == i.InvoiceId
                    && (payout.Amount > 0 || payout.PointsRefunded > 0))))
            .ExecuteUpdateAsync(update => update.SetProperty(p => p.ExpiresAtUtc, closes)
                .SetProperty(p => p.Status, status), ct);
        await ClosePendingAsync(new(openingMinute, closingMinute), now, null, ct, clampAll: true);
    }

    public async Task CloseDueAsync(CancellationToken ct = default, Guid? invoiceId = null)
    {
        // The same sweep runs on reads/payment attempts as well as the background job.
        // Access is rejected at the exact boundary even if the job has not ticked yet.
        await using var tx = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(ct) : null;
        await DayPassHoursLock.AcquireAsync(db, ct: ct);
        var hours = await CenterOperatingHours.ReadAsync(settings, ct);
        await ClosePendingAsync(hours, clock.UtcNow, invoiceId, ct);
        if (tx is not null) await tx.CommitAsync(ct);
    }

    private async Task ClosePendingAsync(CenterOperatingHours hours, DateTime now, Guid? invoiceId, CancellationToken ct, bool clampAll = false)
    {
        var startOfToday = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(now)));
        var isOpen = DayPassClock.IsOpen(now, hours);
        var ids = await db.Set<Invoice>().AsNoTracking()
            .Where(i => (invoiceId == null || i.InvoiceId == invoiceId)
                && (clampAll || !isOpen || i.IssuedAt < startOfToday)
                && (i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.Void && i.IssuedAt >= startOfToday)
                && db.Set<MemberPackage>().Any(p => p.MemberPackageId == i.MemberPackageId && p.PackageId == DayPass.PackageId)
                && db.Set<CheckoutSession>().Any(s => s.CheckoutSessionId == i.CheckoutCycleId
                    && (s.State == "Active" || s.State == "Expired")))
            .OrderBy(i => i.InvoiceId).Select(i => i.InvoiceId).ToListAsync(ct);
        foreach (var id in ids)
        {
            var invoice = await db.Set<Invoice>().FromSqlInterpolated(
                $"SELECT * FROM invoices WHERE invoice_id = {id} FOR UPDATE").SingleAsync(ct);
            if (invoice.Status is not (InvoiceStatus.Issued or InvoiceStatus.Void)) continue;
            var session = await db.Set<CheckoutSession>().SingleAsync(s => s.CheckoutSessionId == invoice.CheckoutCycleId, ct);
            if (session.State is not ("Active" or "Expired")) continue;
            var closes = DayPassClock.ClosesAtUtc(invoice.IssuedAt, hours);
            if (now >= closes || invoice.IssuedAt < startOfToday || !DayPassClock.IsOpen(now, hours))
            {
                if (invoice.Status == InvoiceStatus.Issued)
                    await fulfillment.ReleaseAsync(invoice, session, "Expired", null, ct);
                session.State = ClosedState;
            }
            else if (invoice.Status == InvoiceStatus.Issued && session.ExpiresAtUtc > closes)
            {
                // Never lengthen an existing payment hold, even when opening hours are extended.
                session.ExpiresAtUtc = closes;
                invoice.HoldExpiresAtUtc = closes;
            }
        }
        await db.SaveChangesAsync(ct);
    }
}
