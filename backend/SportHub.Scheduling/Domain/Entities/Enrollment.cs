namespace SportHub.Scheduling.Domain.Entities;

/// <summary>
/// Ghi danh cả khóa (BR-16, 110, 114). Chỉ sinh từ fulfillment sau thanh toán: gắn InvoiceItem đã trả. Không có ghi danh miễn phí
/// và không trừ quota Membership. Partial unique (ClassId, MemberId) khi Confirmed.
/// </summary>
public class Enrollment
{
    public Guid EnrollmentId { get; set; }

    public int ClassId { get; set; }

    public Class? Class { get; set; }

    /// <summary>Cross-module: chỉ scalar; FK sang invoice_items cấu hình ở host.</summary>
    public Guid MemberId { get; set; }

    /// <summary>InvoiceItem loại ClassPackage đã thanh toán. Nullable ở DB để chứa dữ liệu seed/legacy; service luôn gán khi fulfillment.</summary>
    public Guid? InvoiceItemId { get; set; }

    public EnrollmentStatus Status { get; set; }

    public DateTime EnrolledAt { get; set; }

    public DateTime? EndedAt { get; set; }

    /// <summary>Ghi danh này là kết quả chuyển lớp từ ghi danh nguồn (BR-120).</summary>
    public Guid? SourceEnrollmentId { get; set; }

    /// <summary>Paid difference invoice item added by a higher priced threshold transfer.</summary>
    public Guid? TransferDifferenceInvoiceItemId { get; set; }
}
