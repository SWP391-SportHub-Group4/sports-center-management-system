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

    // BR-55. Lúc phát hành: IssuedAt + 2 tháng. Khi nhận khoản Success ĐẦU TIÊN:
    // FirstDepositAtUtc = PaidAt và DueDateUtc = PaidAt + 12 tháng. Khoản thứ hai trở đi
    // không đụng vào hai field này.
    //
    // Lưu tường minh thay vì suy ra khi đọc: suy ra phải quét toàn bộ Payment mỗi lần đọc,
    // và kết quả sẽ ĐỔI nếu sau đó một Payment bị chuyển sang Failed.
    public DateTime DueDateUtc { get; set; }

    public DateTime? FirstDepositAtUtc { get; set; }

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
}
