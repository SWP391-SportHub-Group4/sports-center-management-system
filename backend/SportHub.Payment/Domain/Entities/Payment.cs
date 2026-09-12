using SportHub.Identity.Domain.Entities;

namespace SportHub.Payment.Domain.Entities;

public class Payment
{
    public Guid PaymentId { get; set; } // PK

    public Guid InvoiceId { get; set; } // FK -> Invoice

    public Invoice? Invoice { get; set; }

    public decimal Amount { get; set; } // số tiền lần thu này

    public PaymentMethod Method { get; set; } // Cash/Card/Transfer/EWallet

    public string? ReferenceCode { get; set; } // mã tham chiếu từ cổng ngoài, nếu có

    public PaymentStatus Status { get; set; } // Pending/Success/Failed — chỉ Success tính vào tổng đã thu

    public Guid ReceivedByUserId { get; set; } // FK -> UserAccount, nhân viên nhận tiền

    public UserAccount? ReceivedByUser { get; set; }

    public DateTime PaidAt { get; set; }

    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
}
