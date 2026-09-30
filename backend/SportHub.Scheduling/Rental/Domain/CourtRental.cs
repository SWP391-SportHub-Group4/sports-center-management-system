using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Rental.Domain;

public enum CourtRentalStatus { PendingPayment, Confirmed, Cancelled, Completed }

/// <summary>ExternalCoach's private booking record; pricing and schedule are snapshotted at checkout.</summary>
public sealed class CourtRental
{
    public Guid CourtRentalId { get; set; }
    public Guid ExternalCoachId { get; set; }
    public int SportId { get; set; }
    public int RoomId { get; set; }
    public DateTime StartAtUtc { get; set; }
    public DateTime EndAtUtc { get; set; }
    public int ExpectedAttendees { get; set; }
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
