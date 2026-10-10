using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.Commands.Checkouts;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Infrastructure;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Application.Services;

public sealed class CheckoutService(ISportHubDbContext db,
    IClassEnrollmentFulfillment classes, IInvoiceNumberGenerator invoiceNumbers, ISportCatalogReader catalog,
    PaymentNoticeService notices,
    ISystemSettingProvider settings, IPtPurchaseFulfillment pt, ICourtRentalFulfillment rentals, IPaymentGateway gateway,
    IPackagePurchaseService packages, IMembershipFulfillment memberships, PaymentFulfillmentService fulfillment, IAuditWriter audit, IClock clock)
    : ICheckoutLifecycleService
{
    public async Task<CheckoutResponse> FindByReferenceAsync(string reference, Guid actorId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(reference) || reference.Length > 120)
            throw new BadRequestException("payment_reference_invalid", "Mã giao dịch không hợp lệ.");
        var invoiceId = await (from attempt in db.Set<PaymentAttempt>().AsNoTracking()
            join invoice in db.Set<Invoice>() on attempt.InvoiceId equals invoice.InvoiceId
            where attempt.VnpTxnRef == reference && (invoice.MemberId == actorId || invoice.IssuedByUserId == actorId)
            select (Guid?)invoice.InvoiceId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("checkout_not_found", "Không tìm thấy giao dịch của bạn.");
        return await GetAsync(invoiceId, actorId, true, ct);
    }

    public async Task<CheckoutResponse> FindByKeyAsync(string key, Guid actorId, CancellationToken ct)
    {
        RequireKey(key);
        var invoiceId = await (from session in db.Set<CheckoutSession>().AsNoTracking()
            join invoice in db.Set<Invoice>() on session.InvoiceId equals invoice.InvoiceId
            where session.IdempotencyKey == key && (invoice.MemberId == actorId || invoice.IssuedByUserId == actorId)
            select (Guid?)invoice.InvoiceId).FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("checkout_not_found", "Không tìm thấy checkout của yêu cầu này.");
        return await GetAsync(invoiceId, actorId, true, ct);
    }

    public async Task<CheckoutResponse> RetryAsync(Guid oldInvoiceId, string idempotencyKey,
        string? priceVersion, Guid actorId, bool isFrontDesk, bool isManager, CancellationToken ct)
    {
        RequireKey(idempotencyKey);
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.InvoiceId == oldInvoiceId, ct)
            ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
        EnsureAccess(invoice, actorId, isFrontDesk);
        var old = await db.Set<CheckoutSession>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct)
            ?? throw new ConflictException("checkout_unavailable", "Không tìm thấy checkout cũ.");
        if (invoice.Status is InvoiceStatus.Paid or InvoiceStatus.PaidAfterReconciliation || old.ExpiresAtUtc > clock.UtcNow)
            throw new ConflictException("checkout_retry_too_early", "Chỉ tạo lại checkout đã hết hạn và chưa trả.");
        if (invoice.Status == InvoiceStatus.Issued)
            await CancelAsync(oldInvoiceId, actorId, isFrontDesk, ct);
        Guid? target = isFrontDesk ? invoice.MemberId : null;
        switch (old.Kind)
        {
            case "Membership":
            {
                if (invoice.MemberPackageId is not Guid memberPackageId)
                    throw new ConflictException("checkout_kind_unsupported", "Checkout thiếu gói Membership.");
                var package = await memberships.GetAsync(memberPackageId, ct);
                var detail = await packages.PurchaseAsync(new PurchasePackageRequest
                {
                    MemberId = invoice.MemberId, PackageId = package.PackageId,
                    AllowStacking = package.StackingApprovedByUserId is not null,
                    StackingApprovalReason = package.StackingApprovalReason
                }, actorId, isManager, ct, idempotencyKey);
                return await GetAsync(detail.Summary.InvoiceId, actorId, isFrontDesk, ct);
            }
            case "Class" when old.ClassId is int classId:
                return await CreateClassAsync(new ClassCheckoutRequest(classId, target),
                    idempotencyKey, actorId, isFrontDesk, ct);
            case "PT" when old.PtMemberPackageId is Guid membershipId
                && old.PtCoachId is Guid coachId && old.PtFrequency is int frequency:
                if (string.IsNullOrWhiteSpace(priceVersion))
                    throw new BadRequestException("pt_price_version_required", "Cần xác nhận báo giá PT mới.");
                return await CreatePtAsync(new PtCheckoutRequest(membershipId, coachId, frequency,
                    priceVersion, target, old.PtStartAtUtc, old.PtRoomId), idempotencyKey, actorId, isFrontDesk, ct);
            case "CourtRental" when old.ResourceHoldId is Guid rentalId:
                return await CreateCourtRentalAsync(await rentals.GetForRetryAsync(rentalId, ct), idempotencyKey, actorId, ct);
            default:
                throw new ConflictException("checkout_kind_unsupported", "Chưa hỗ trợ tạo lại loại checkout này.");
        }
    }

    public async Task<CheckoutResponse> CreatePtAsync(PtCheckoutRequest request, string idempotencyKey,
        Guid actorId, bool isFrontDesk, CancellationToken ct)
    {
        var memberId = ResolveMember(request.TargetMemberId, actorId, isFrontDesk);
        RequireKey(idempotencyKey);
        var now = clock.UtcNow;
        var minutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {memberId} FOR UPDATE", ct);
        var existing = await db.Set<CheckoutSession>().AsNoTracking()
            .Where(x => x.IdempotencyKey == idempotencyKey && x.Kind == "PT")
            .Join(db.Set<Invoice>().AsNoTracking(), s => s.InvoiceId, i => i.InvoiceId,
                (s, i) => new { Session = s, Invoice = i }).SingleOrDefaultAsync(ct);
        if (existing is not null)
        {
            if (existing.Invoice.MemberId != memberId
                || existing.Session.PtMemberPackageId != request.MemberPackageId
                || existing.Session.PtCoachId != request.CoachId
                || existing.Session.PtFrequency != request.FrequencyPerWeek
                || existing.Session.PtStartAtUtc != request.StartAtUtc
                || existing.Session.PtRoomId != request.RoomId)
                throw new ConflictException("idempotency_key_reused", "Khóa idempotency đã dùng cho giao dịch khác.");
            await tx.CommitAsync(ct);
            return await GetAsync(existing.Invoice.InvoiceId, actorId, isFrontDesk, ct);
        }
        var ptRequest = new PtPurchaseRequest(memberId, request.MemberPackageId,
            request.CoachId, request.FrequencyPerWeek, request.StartAtUtc, request.RoomId);
        var quote = await pt.QuoteAsync(ptRequest, ct);
        if (quote.PriceVersion != request.PriceVersion)
            throw new ConflictException("pt_price_changed", "Giá PT đã đổi; hãy xem báo giá mới và xác nhận lại.");
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(), InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = memberId, IssuedByUserId = actorId, TotalAmount = quote.TotalPrice,
            CashAmount = quote.TotalPrice, CheckoutCycleId = Guid.NewGuid(), CheckoutRevision = 1,
            HoldExpiresAtUtc = now.AddMinutes(minutes), Status = InvoiceStatus.Issued, IssuedAt = now
        };
        db.Set<Invoice>().Add(invoice);
        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.PT,
            Description = $"PT coach {request.CoachId}; Membership {request.MemberPackageId}; "
                + (request.StartAtUtc is DateTime start ? $"1 buổi 90 phút; {start:O}; " : $"{quote.FrequencyPerWeek}/tuần; ")
                + $"priceVersion {quote.PriceVersion}",
            UnitPrice = quote.PricePerSession, Quantity = quote.TotalQuota,
            LineAmount = quote.TotalPrice, SportId = quote.SportId, SportNameSnapshot = quote.SportName,
            PtFrequencyPerWeek = request.StartAtUtc.HasValue ? null : quote.FrequencyPerWeek
        };
        db.Set<InvoiceItem>().Add(item);
        await db.SaveChangesAsync(ct);
        item.RelatedEntityId = await pt.CreatePendingAsync(ptRequest, item.ItemId, ct);
        item.PtEntitlementId = item.RelatedEntityId;
        var session = new CheckoutSession
        {
            CheckoutSessionId = invoice.CheckoutCycleId.Value, InvoiceId = invoice.InvoiceId,
            Revision = 1, IdempotencyKey = idempotencyKey, Kind = "PT", State = "Active",
            CreatedAtUtc = now, ExpiresAtUtc = invoice.HoldExpiresAtUtc.Value,
            PtMemberPackageId = request.MemberPackageId, PtCoachId = request.CoachId,
            PtFrequency = request.FrequencyPerWeek,
            PtStartAtUtc = request.StartAtUtc,
            PtRoomId = request.RoomId
        };
        db.Set<CheckoutSession>().Add(session);
        audit.Write(new AuditEntry(actorId, "CREATE_PT_CHECKOUT", nameof(Invoice), invoice.InvoiceId.ToString()));
        await notices.CreatedAsync(invoice, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResponse(invoice, session);
    }

    public async Task<CheckoutResponse> CreateClassAsync(ClassCheckoutRequest request, string idempotencyKey,
        Guid actorId, bool isFrontDesk, CancellationToken ct)
    {
        var memberId = ResolveMember(request.TargetMemberId, actorId, isFrontDesk);
        RequireKey(idempotencyKey);
        var now = clock.UtcNow;
        var minutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // The member lock serializes idempotent double-clicks and schedule conflict checks.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {memberId} FOR UPDATE", ct);
        var existing = await db.Set<CheckoutSession>().AsNoTracking()
            .Where(x => x.IdempotencyKey == idempotencyKey)
            .Join(db.Set<Invoice>().AsNoTracking(), s => s.InvoiceId, i => i.InvoiceId,
                (s, i) => new { Session = s, Invoice = i }).SingleOrDefaultAsync(ct);
        if (existing is not null)
        {
            if (existing.Invoice.MemberId != memberId || existing.Session.ClassId != request.ClassId
                || existing.Session.Kind != "Class")
                throw new ConflictException("idempotency_key_reused", "Khóa idempotency đã dùng cho giao dịch khác.");
            await tx.CommitAsync(ct);
            return await GetAsync(existing.Invoice.InvoiceId, actorId, isFrontDesk, ct);
        }
        var quote = await classes.QuoteAsync(request.ClassId, memberId, ct);
        if (quote.Price <= 0 || quote.Price % 1000 != 0)
            throw new ConflictException("class_price_invalid", "Giá khóa học phải là bội số 1.000 VND.");
        var expiry = now.AddMinutes(minutes);
        if (expiry >= quote.FirstSessionUtc.UtcDateTime)
            expiry = quote.FirstSessionUtc.UtcDateTime.AddSeconds(-1);
        if (expiry <= now) throw new ConflictException("class_started", "Khóa sắp bắt đầu, không đủ thời gian thanh toán.");
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(), InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = memberId, IssuedByUserId = actorId, TotalAmount = quote.Price,
            CashAmount = quote.Price, CheckoutCycleId = Guid.NewGuid(), CheckoutRevision = 1,
            HoldExpiresAtUtc = expiry, Status = InvoiceStatus.Issued, IssuedAt = now
        };
        db.Set<Invoice>().Add(invoice);
        await db.SaveChangesAsync(ct);
        var hold = await classes.ReserveAsync(request.ClassId, memberId, invoice.InvoiceId,
            new DateTimeOffset(expiry), ct);
        db.Set<InvoiceItem>().Add(new InvoiceItem
        {
            ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.ClassPackage,
            Description = $"Khóa học {quote.SportName} #{request.ClassId}", UnitPrice = quote.Price,
            Quantity = 1, LineAmount = quote.Price, RelatedEntityId = hold.SeatHoldId,
            ClassId = quote.ClassId, SportId = quote.SportId, SportNameSnapshot = quote.SportName
        });
        var session = new CheckoutSession
        {
            CheckoutSessionId = invoice.CheckoutCycleId.Value, InvoiceId = invoice.InvoiceId,
            Revision = 1, IdempotencyKey = idempotencyKey, Kind = "Class", State = "Active",
            CreatedAtUtc = now, ExpiresAtUtc = expiry, ResourceHoldId = hold.SeatHoldId,
            ClassId = request.ClassId
        };
        db.Set<CheckoutSession>().Add(session);
        audit.Write(new AuditEntry(actorId, "CREATE_CLASS_CHECKOUT", nameof(Invoice), invoice.InvoiceId.ToString()));
        await notices.CreatedAsync(invoice, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResponse(invoice, session);
    }

    public async Task<CheckoutResponse> CreateCourtRentalAsync(CourtRentalRequest request, string idempotencyKey,
        Guid actorId, CancellationToken ct)
    {
        if (request.MemberId != actorId)
            throw new ForbiddenException("rental_owner_mismatch", "Member chỉ được đặt sân cho chính mình.");
        RequireKey(idempotencyKey);
        var now = clock.UtcNow;
        var minutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);
        if (minutes is < 1 or > 1440)
            throw new ConflictException("hold_setting_invalid", "Thời hạn checkout không hợp lệ.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {actorId} FOR UPDATE", ct);
        var existing = await db.Set<CheckoutSession>().AsNoTracking()
            .Where(x => x.IdempotencyKey == idempotencyKey && x.Kind == "CourtRental")
            .Join(db.Set<Invoice>().AsNoTracking(), s => s.InvoiceId, i => i.InvoiceId,
                (s, i) => new { Session = s, Invoice = i }).SingleOrDefaultAsync(ct);
        if (existing is not null)
        {
            if (existing.Invoice.MemberId != actorId || existing.Session.ResourceHoldId is not Guid existingRentalId)
                throw new ConflictException("idempotency_key_reused", "Khóa idempotency đã dùng cho giao dịch khác.");
            var priorRequest = await rentals.GetForRetryAsync(existingRentalId, ct);
            if (priorRequest.SportId != request.SportId || priorRequest.RoomId != request.RoomId
                || priorRequest.StartUtc != request.StartUtc || priorRequest.EndUtc != request.EndUtc)
                throw new ConflictException("idempotency_key_reused", "Khóa idempotency đã dùng cho lượt thuê khác.");
            await tx.CommitAsync(ct);
            return await GetAsync(existing.Invoice.InvoiceId, actorId, false, ct);
        }
        var quote = await rentals.QuoteAsync(request, ct);
        var expiry = new DateTimeOffset(now.AddMinutes(minutes), TimeSpan.Zero);
        if (expiry >= request.StartUtc) expiry = request.StartUtc.AddSeconds(-1);
        if (expiry <= now)
            throw new ConflictException("rental_checkout_window_closed", "Không đủ thời gian thanh toán trước giờ thuê.");
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(), InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = actorId, IssuedByUserId = actorId, TotalAmount = quote.TotalPrice,
            CashAmount = quote.TotalPrice, CheckoutCycleId = Guid.NewGuid(), CheckoutRevision = 1,
            HoldExpiresAtUtc = expiry.UtcDateTime, Status = InvoiceStatus.Issued, IssuedAt = now
        };
        db.Set<Invoice>().Add(invoice);
        await db.SaveChangesAsync(ct);
        var rentalId = await rentals.ReserveAsync(invoice.InvoiceId, request, expiry, quote, ct);
        var sportName = (await catalog.GetSportAsync(request.SportId, ct))?.Name;
        var roomName = (await catalog.GetRoomAsync(request.RoomId, ct))?.Name;
        var startLocal = VietnamTime.ToLocal(request.StartUtc.UtcDateTime);
        var endLocal = VietnamTime.ToLocal(request.EndUtc.UtcDateTime);
        var rentalLabel = string.Join(" · ", new[] { sportName, roomName }.Where(x => !string.IsNullOrWhiteSpace(x)));
        db.Set<InvoiceItem>().Add(new InvoiceItem
        {
            ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.Rental,
            Description = $"Thuê sân {rentalLabel}, {startLocal:dd/MM/yyyy} {startLocal:HH:mm}-{endLocal:HH:mm} ({quote.Blocks.Count} giờ)",
            UnitPrice = quote.TotalPrice, Quantity = 1, LineAmount = quote.TotalPrice, RelatedEntityId = rentalId,
            CourtRentalId = rentalId, SportId = request.SportId,
            SportNameSnapshot = sportName
        });
        var session = new CheckoutSession
        {
            CheckoutSessionId = invoice.CheckoutCycleId!.Value, InvoiceId = invoice.InvoiceId,
            Revision = 1, IdempotencyKey = idempotencyKey, Kind = "CourtRental", State = "Active",
            CreatedAtUtc = now, ExpiresAtUtc = expiry.UtcDateTime, ResourceHoldId = rentalId
        };
        db.Set<CheckoutSession>().Add(session);
        audit.Write(new AuditEntry(actorId, "CREATE_COURT_RENTAL_CHECKOUT", nameof(Invoice), invoice.InvoiceId.ToString()));
        await notices.CreatedAsync(invoice, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResponse(invoice, session);
    }

    public async Task<CheckoutResponse> GetAsync(Guid invoiceId, Guid actorId, bool isStaff, CancellationToken ct)
    {
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleOrDefaultAsync(x => x.InvoiceId == invoiceId, ct)
            ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
        EnsureAccess(invoice, actorId, isStaff);
        var session = await db.Set<CheckoutSession>().AsNoTracking().SingleOrDefaultAsync(
            x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct)
            ?? throw new NotFoundException("checkout_not_found", "Không tìm thấy checkout.");
        return ToResponse(invoice, session);
    }

    public async Task<CheckoutResponse> ConfirmPointsAsync(Guid invoiceId, Guid actorId, bool isStaff, CancellationToken ct)
    {
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var invoice = await LockInvoiceAsync(invoiceId, ct);
            EnsureAccess(invoice, actorId, isStaff);
            if (await db.Set<SportHub.Payment.Wallet.Domain.PointConfirmation>().AnyAsync(x => x.InvoiceId == invoiceId
                && x.ConsumedAtUtc == null && x.RevokedAtUtc == null, ct))
                throw new ConflictException("point_confirmation_pending", "Cần xác minh hoặc bỏ yêu cầu điểm tại quầy trước khi thanh toán.");
            if (invoice.Status is InvoiceStatus.Paid or InvoiceStatus.PaidAfterReconciliation)
            {
                await tx.CommitAsync(ct);
            }
            else
            {
                var session = await db.Set<CheckoutSession>().SingleOrDefaultAsync(x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct)
                    ?? throw new ConflictException("checkout_unavailable", "Không tìm thấy checkout.");
                if (invoice.CashAmount != 0 || invoice.Status != InvoiceStatus.Issued || session.State != "Active"
                    || session.ExpiresAtUtc <= clock.UtcNow || invoice.ReconciliationRequired)
                    throw new ConflictException("checkout_unavailable", "Checkout không đủ điều kiện thanh toán toàn điểm.");
                if (await db.Set<VerifiedGatewayEvent>().AnyAsync(e =>
                    (e.ProcessingStatus == "Pending" || e.ProcessingStatus == "ReconciliationRequired")
                    && db.Set<PaymentAttempt>().Any(a => a.PaymentAttemptId == e.PaymentAttemptId && a.InvoiceId == invoiceId), ct))
                    throw new ConflictException("payment_reconciliation_pending", "Khoản thu đang đối soát.");
                await fulfillment.CompletePointsAsync(invoice, session, ct);
                await tx.CommitAsync(ct);
            }
        }
        return await GetAsync(invoiceId, actorId, isStaff, ct);
    }

    public async Task<PaymentAttemptResponse> StartPaymentAsync(Guid invoiceId, Guid actorId,
        bool isStaff, string clientIp, CancellationToken ct)
    {
        Guid attemptId = Guid.Empty;
        Guid cycleId = Guid.Empty;
        string? reference = null;
        decimal amount = 0;
        int points = 0;
        DateTime expiry = default;
        DateTime createdAt = default;
        string? url = null;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var invoice = await LockInvoiceAsync(invoiceId, ct);
            EnsureAccess(invoice, actorId, isStaff);
            if (await db.Set<SportHub.Payment.Wallet.Domain.PointConfirmation>().AnyAsync(x => x.InvoiceId == invoiceId
                && x.ConsumedAtUtc == null && x.RevokedAtUtc == null, ct))
                throw new ConflictException("point_confirmation_pending", "Cần xác minh hoặc bỏ yêu cầu điểm tại quầy trước khi thanh toán.");
            var session = await db.Set<CheckoutSession>().SingleOrDefaultAsync(
                x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct)
                ?? throw new ConflictException("checkout_unavailable", "Không tìm thấy chu kỳ checkout.");
            if (invoice.Status != InvoiceStatus.Issued || session.State != "Active"
                || session.ExpiresAtUtc <= clock.UtcNow)
                throw new ConflictException("checkout_unavailable", "Chu kỳ checkout đã hết hiệu lực.");
            if (invoice.ReconciliationRequired || await db.Set<VerifiedGatewayEvent>().AnyAsync(e =>
                    (e.ProcessingStatus == "Pending" || e.ProcessingStatus == "ReconciliationRequired")
                    && db.Set<PaymentAttempt>().Any(a => a.PaymentAttemptId == e.PaymentAttemptId
                        && a.InvoiceId == invoiceId), ct))
                throw new ConflictException("payment_reconciliation_pending", "Khoản thu đang đối soát; không tạo attempt mới.");
            if (invoice.CashAmount == 0)
            {
                await fulfillment.CompletePointsAsync(invoice, session, ct);
                await tx.CommitAsync(ct);
                return new PaymentAttemptResponse(Guid.Empty, invoiceId, string.Empty, 0,
                    invoice.PointsApplied, clock.UtcNow, null, "Paid");
            }
            var pending = await db.Set<PaymentAttempt>().Where(x => x.InvoiceId == invoiceId
                    && x.Status == PaymentAttemptStatus.Pending).OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);
            if (pending is not null)
            {
                if (pending.CheckoutSessionId != session.CheckoutSessionId || pending.Amount != invoice.CashAmount
                    || pending.PointsSnapshot != invoice.PointsApplied || pending.VnpExpireDate <= clock.UtcNow)
                    throw new ConflictException("payment_attempt_changed", "Attempt cũ cần đối soát hoặc checkout mới.");
                attemptId = pending.PaymentAttemptId;
                reference = pending.VnpTxnRef;
                amount = pending.Amount;
                points = pending.PointsSnapshot;
                expiry = pending.VnpExpireDate;
                createdAt = pending.CreatedAt;
            }
            else
            {
                expiry = session.ExpiresAtUtc;
                amount = invoice.CashAmount;
                points = invoice.PointsApplied;
                cycleId = session.CheckoutSessionId;
                attemptId = Guid.NewGuid();
                reference = attemptId.ToString("N");
                createdAt = clock.UtcNow;
                db.Set<PaymentAttempt>().Add(new PaymentAttempt
                {
                    PaymentAttemptId = attemptId, InvoiceId = invoiceId,
                    CheckoutSessionId = cycleId, VnpTxnRef = reference, Amount = amount,
                    CashSnapshot = amount, PointsSnapshot = points, VnpExpireDate = expiry,
                    Status = PaymentAttemptStatus.Pending, CreatedAt = createdAt
                });
            }
            url = gateway.CreatePaymentUrl(reference!, amount, createdAt, expiry, clientIp);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        return new PaymentAttemptResponse(attemptId, invoiceId, reference!, amount, points, expiry, url, "Pending", gateway is MockPaymentGateway ? "MOCK" : "VNPAY");
    }

    public async Task CancelAsync(Guid invoiceId, Guid actorId, bool isStaff, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoiceAsync(invoiceId, ct);
        EnsureAccess(invoice, actorId, isStaff);
        if (invoice.Status == InvoiceStatus.Void) return;
        if (invoice.Status != InvoiceStatus.Issued)
            throw new ConflictException("checkout_already_paid", "Không thể hủy checkout đã thanh toán.");
        var session = await db.Set<CheckoutSession>().SingleOrDefaultAsync(
            x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct);
        if (session is null) throw new ConflictException("checkout_unavailable", "Không tìm thấy chu kỳ checkout.");
        var attemptIds = await db.Set<PaymentAttempt>().Where(a => a.InvoiceId == invoiceId)
            .Select(a => a.PaymentAttemptId).ToListAsync(ct);
        if (await db.Set<VerifiedGatewayEvent>().AnyAsync(e => attemptIds.Contains(e.PaymentAttemptId)
                && (e.ProcessingStatus == "Pending" || e.ProcessingStatus == "ReconciliationRequired"), ct))
            throw new ConflictException("payment_reconciliation_pending", "Thanh toán cần được đối soát trước khi hủy.");
        await fulfillment.ReleaseAsync(invoice, session, "Cancelled", actorId, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task ReleaseForSystemAsync(Guid invoiceId, string reason, CancellationToken ct = default)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("System checkout release requires the caller's transaction.");
        var invoice = await LockInvoiceAsync(invoiceId, ct);
        if (invoice.Status == InvoiceStatus.Void) return;
        if (invoice.Status != InvoiceStatus.Issued)
            throw new ConflictException("checkout_system_release_reconciliation", "Checkout đã thanh toán hoặc cần đối soát.");
        var session = await db.Set<CheckoutSession>().SingleOrDefaultAsync(
            x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct)
            ?? throw new ConflictException("checkout_unavailable", "Không tìm thấy chu kỳ checkout.");
        var attemptIds = await db.Set<PaymentAttempt>().Where(a => a.InvoiceId == invoiceId)
            .Select(a => a.PaymentAttemptId).ToListAsync(ct);
        if (await db.Set<VerifiedGatewayEvent>().AnyAsync(e => attemptIds.Contains(e.PaymentAttemptId)
                && (e.ProcessingStatus == "Pending" || e.ProcessingStatus == "ReconciliationRequired"), ct))
            throw new ConflictException("payment_reconciliation_pending", "Thanh toán đang được đối soát.");
        await fulfillment.ReleaseAsync(invoice, session, reason, null, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<PendingCheckoutState> GetStateAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleOrDefaultAsync(x => x.InvoiceId == invoiceId, cancellationToken)
            ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
        var session = await db.Set<CheckoutSession>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.CheckoutSessionId == invoice.CheckoutCycleId, cancellationToken)
            ?? throw new ConflictException("checkout_unavailable", "Không tìm thấy chu kỳ checkout.");
        return new PendingCheckoutState(invoice.Status.ToString(), session.State, session.ExpiresAtUtc);
    }

    private static Guid ResolveMember(Guid? target, Guid actorId, bool isFrontDesk)
    {
        if (isFrontDesk) return target ?? throw new BadRequestException("target_member_required", "Cần chọn hội viên.");
        if (target is not null && target != actorId)
            throw new ForbiddenException("target_member_forbidden", "Không thể thanh toán cho tài khoản khác.");
        return actorId;
    }

    private static void EnsureAccess(Invoice invoice, Guid actorId, bool isStaff)
    {
        if (!isStaff && invoice.MemberId != actorId)
            throw new ForbiddenException("checkout_not_owned", "Checkout không thuộc tài khoản của bạn.");
    }

    private static void RequireKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 120)
            throw new BadRequestException("idempotency_key_required", "Cần Idempotency-Key hợp lệ.");
    }

    private CheckoutResponse ToResponse(Invoice i, CheckoutSession s)
        => new(i.InvoiceId, s.CheckoutSessionId, s.Revision, s.Kind, s.State,
            i.TotalAmount, i.PointsApplied, i.CashAmount, s.ExpiresAtUtc, s.ResourceHoldId,
            i.Status.ToString(), Domain.Rules.InvoiceFulfillment.Outcome(i.Status, i.PaidVia, i.ReconciliationRequired),
            i.ReconciliationRequired, i.MemberId, i.IssuedByUserId, clock.UtcNow, s.PtMemberPackageId, s.PtCoachId, s.PtFrequency,
            s.PtStartAtUtc, s.PtRoomId);

    private async Task<Invoice> LockInvoiceAsync(Guid id, CancellationToken ct)
        => await db.Set<Invoice>().FromSqlInterpolated($"SELECT * FROM invoices WHERE invoice_id = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
}
