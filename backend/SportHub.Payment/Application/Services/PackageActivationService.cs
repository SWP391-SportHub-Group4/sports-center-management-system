using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// BR-30 — kích hoạt MemberPackage khi nghĩa vụ của hoá đơn đã được thoả.
///
/// Tách khỏi <see cref="PaymentRecordingService"/> vì nghĩa vụ có thể được thoả bằng HAI
/// đường: thu nốt tiền, hoặc Manager duyệt một Discount/Correction làm nghĩa vụ tụt xuống
/// bằng số đã thu. Bản trước chỉ gọi ở đường thu, nên hội viên được giảm giá phần còn nợ
/// sẽ có hoá đơn Paid mà gói vẫn nằm im ở PendingPayment.
///
/// Kích hoạt đúng MỘT lần (BR-30): điều kiện vào là Status = PendingPayment, nên retry hay
/// một khoản thu thứ hai đều không reset ngày và lượt.
/// </summary>
public sealed class PackageActivationService(
    ISportHubDbContext db,
    IAuditWriter audit,
    INotificationWriter notifications,
    IClock clock) : IPackageActivationService
{
    public async Task ActivateIfObligationMetAsync(
        Invoice invoice,
        InvoiceBalance balance,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (invoice.MemberPackageId is null || !balance.IsFullyPaid)
        {
            return;
        }

        var memberPackage = await db.Set<MemberPackage>()
            .SingleOrDefaultAsync(mp => mp.MemberPackageId == invoice.MemberPackageId, ct);

        // Gói đã bị huỷ trước khi thu đủ thì KHÔNG hồi sinh: SSOT §4 không có nhánh
        // Cancelled → Active. Tiền đã thu vẫn còn trên hoá đơn và xử lý qua PaymentAdjustment.
        if (memberPackage is null || memberPackage.Status != MemberPackageStatus.PendingPayment)
        {
            return;
        }

        var catalog = await db.Set<MembershipPackage>()
            .SingleAsync(p => p.PackageId == memberPackage.PackageId, ct);

        // BR-10 — mặc định chỉ một gói cùng PackageId được Active. Kiểm tra LẠI tại thời điểm
        // kích hoạt chứ không chỉ lúc bán: giữa lúc bán và lúc trả đủ tiền (có thể cách nhau
        // 12 tháng theo BR-55) hội viên hoàn toàn có thể đã mua và kích hoạt một gói cùng loại.
        var hasActiveSamePackage = await db.Set<MemberPackage>()
            .AnyAsync(
                mp => mp.MemberId == memberPackage.MemberId
                      && mp.PackageId == memberPackage.PackageId
                      && mp.MemberPackageId != memberPackage.MemberPackageId
                      && mp.Status == MemberPackageStatus.Active,
                ct);

        if (hasActiveSamePackage && memberPackage.StackingApprovedByUserId is null)
        {
            throw new ConflictException(
                "package_stacking_not_approved",
                $"Hội viên đang có một gói '{catalog.Name}' còn hiệu lực. Cộng dồn cùng loại gói phải "
                + "được Center Manager duyệt trước (BR-10).");
        }

        // Quyết định C4/BR-30: gói chạy từ NGÀY thanh toán đủ (giờ VN), không phải từ ngày
        // phát hành hoá đơn — hội viên trả góp hai tháng không bị mất hai tháng sử dụng.
        var (startDate, endDate) = MemberPackageRules.ComputePeriod(
            VietnamTime.TodayLocal(clock), catalog.DurationDays);

        memberPackage.StartDate = startDate;
        memberPackage.EndDate = endDate;
        memberPackage.RemainingSessions = catalog.SessionLimit;
        memberPackage.Status = MemberPackageStatus.Active;

        audit.Write(new AuditEntry(
            actorUserId, "ACTIVATE_MEMBER_PACKAGE", nameof(MemberPackage), memberPackage.MemberPackageId.ToString(),
            OldValue: $"{{\"status\":\"{MemberPackageStatus.PendingPayment}\"}}",
            NewValue: $"{{\"status\":\"{MemberPackageStatus.Active}\",\"startDate\":\"{startDate:yyyy-MM-dd}\","
                      + $"\"endDate\":\"{endDate:yyyy-MM-dd}\",\"invoiceId\":\"{invoice.InvoiceId}\"}}"));

        notifications.Queue(new NotificationRequest(
            invoice.MemberId,
            NotificationEvents.PaymentReceived,
            $"Gói {catalog.Name} đã được kích hoạt, hiệu lực từ {startDate:dd/MM/yyyy} đến {endDate:dd/MM/yyyy}.",
            memberPackage.MemberPackageId));
    }
}
