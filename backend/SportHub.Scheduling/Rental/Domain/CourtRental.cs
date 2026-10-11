using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Rental.Domain;

public enum CourtRentalStatus { PendingPayment, Confirmed, Cancelled, Completed }

/// <summary>Lượt thuê sân của Member; giá và lịch được snapshot lúc checkout.</summary>
public sealed class CourtRental
{
    public Guid CourtRentalId { get; set; }
    /// <summary>Chủ lượt thuê: Member lấy từ người dùng đã xác thực, không nhận từ client.</summary>
    public Guid MemberId { get; set; }
    public int SportId { get; set; }
    public int RoomId { get; set; }
    public DateTime StartAtUtc { get; set; }
    public DateTime EndAtUtc { get; set; }
    public decimal TotalPrice { get; set; }
    public string PriceSnapshotJson { get; set; } = "[]";
    public CourtRentalStatus Status { get; set; }
    public Guid? InvoiceItemId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public Guid? InvoiceId { get; set; }
    public Guid? CancellationIncidentId { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public string? CancelReason { get; set; }
}
