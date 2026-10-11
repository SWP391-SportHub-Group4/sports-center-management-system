using SportHub.Training.Application.Commands;

namespace SportHub.Training.Application.Interfaces;

/// <summary>
/// Contract nội bộ (application-level, KHÔNG phải HTTP endpoint) để nhánh Payment tạo/kích
/// hoạt/hủy/carry-over quyền lợi PT sau khi BE-4 merge — xem
/// docs/backend-be4-pt-training-implementation-plan.md §9.
///
/// Idempotent theo EntitlementId/ActivationReference. Không tự mở transaction riêng nếu caller
/// đang có transaction sẵn (kiểm <c>db.Database.CurrentTransaction</c>) — dùng cùng scoped
/// DbContext với Payment.
/// </summary>
public interface IPtEntitlementLifecycle
{
    /// <summary>
    /// Tạo entitlement ở PendingPayment. Chỉ kiểm domain PT/Member/Coach/Membership — không
    /// tạo Invoice, không đụng giá.
    /// </summary>
    Task<Guid> CreatePendingAsync(CreatePendingPtEntitlementCommand command, CancellationToken ct = default);

    /// <summary>Chỉ thành công khi linked Membership đang Active và quota/validity hợp lệ.</summary>
    Task ActivateAsync(Guid entitlementId, Guid activationReference, CancellationToken ct = default);

    /// <summary>Payment/Refund gọi khi thu hồi quyền lợi; eligibility/refund amount vẫn thuộc Payment.</summary>
    Task CancelAsync(Guid entitlementId, string reason, CancellationToken ct = default);

    /// <summary>Renewal trong 30 calendar days kể từ ValidityEndDate cũ (BR-66).</summary>
    Task CarryOverAsync(Guid entitlementId, Guid renewedMemberPackageId, CancellationToken ct = default);
}
