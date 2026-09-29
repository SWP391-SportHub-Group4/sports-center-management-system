namespace SportHub.BuildingBlocks.Abstractions.Membership;

/// <summary>Kích hoạt/hủy Membership sau thanh toán. Bản cài đặt ở Membership; cùng transaction caller, không SaveChanges.</summary>
public interface IMembershipFulfillment
{
    /// <summary>Idempotent theo <paramref name="invoiceItemId"/>: gọi lại trả MemberPackage đã tạo.</summary>
    Task<Guid> ActivateAsync(Guid invoiceItemId, Guid memberId, int packageId, CancellationToken cancellationToken = default);

    Task CancelAsync(Guid invoiceItemId, string reason, CancellationToken cancellationToken = default);
}
