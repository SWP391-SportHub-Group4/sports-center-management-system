using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;

namespace SportHub.Payment.Domain.Entities;

public class Invoice
{
    public Guid InvoiceId { get; set; }

    public string InvoiceNumber { get; set; } = string.Empty;

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    public Guid IssuedByUserId { get; set; }

    public UserAccount? IssuedByUser { get; set; }

    public Guid? MemberPackageId { get; set; }

    public MemberPackage? MemberPackage { get; set; }

    public decimal TotalAmount { get; set; }

    public InvoiceStatus Status { get; set; }

    public DateTime IssuedAt { get; set; }

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
    public ICollection<PaymentAttempt> PaymentAttempts { get; set; } = new List<PaymentAttempt>();
}
