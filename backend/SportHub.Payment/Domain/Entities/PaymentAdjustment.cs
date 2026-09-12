using SportHub.Identity.Domain.Entities;

namespace SportHub.Payment.Domain.Entities;

public class PaymentAdjustment
{
    public Guid AdjustmentId { get; set; } // PK

    public Guid InvoiceId { get; set; } // FK -> Invoice

    public Invoice? Invoice { get; set; }

    public Guid? PaymentId { get; set; } // FK -> Payment, null nếu không gắn 1 giao dịch cụ thể

    public Payment? Payment { get; set; }

    public PaymentAdjustmentType Type { get; set; } // Refund/Correction/Discount

    public decimal Amount { get; set; }

    public string Reason { get; set; } = string.Empty; // bắt buộc để Manager duyệt có căn cứ

    public PaymentAdjustmentStatus Status { get; set; } // Requested/Approved|Rejected/Completed

    public Guid RequestedByUserId { get; set; } // FK -> UserAccount

    public UserAccount? RequestedByUser { get; set; }

    public Guid? ApprovedByUserId { get; set; } // FK -> UserAccount, null nếu chưa duyệt

    public UserAccount? ApprovedByUser { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ResolvedAt { get; set; }
}
