using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;

namespace SportHub.Payment.Domain.Entities;

public class Invoice
{
    public Guid InvoiceId { get; set; } // PK

    public string InvoiceNumber { get; set; } = string.Empty; // unique, sinh từ DB sequence

    public Guid MemberId { get; set; } // FK -> UserAccount, hóa đơn xuất cho ai

    public UserAccount? Member { get; set; }

    public Guid IssuedByUserId { get; set; } // FK -> UserAccount, nhân viên xuất hóa đơn

    public UserAccount? IssuedByUser { get; set; }

    public Guid? MemberPackageId { get; set; } // FK -> MemberPackage, null nếu là phí khác (vd penalty)

    public MemberPackage? MemberPackage { get; set; }

    public decimal TotalAmount { get; set; } // tổng tiền phải thu

    public InvoiceStatus Status { get; set; } // Issued/PartiallyPaid/Paid/Void

    public DateTime IssuedAt { get; set; }

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
}
