namespace SportHub.Scheduling.Domain.Entities;

/// <summary>
/// Giữ chỗ trong lúc checkout (BR-115). Active chiếm reserved_count của lớp đến <see cref="ExpiresAtUtc"/>; hết hạn/hủy/thanh toán
/// đều chuyển trạng thái đúng một lần và trả reserved_count tương ứng. Partial unique (ClassId, MemberId) khi Active.
/// </summary>
public class SeatHold
{
    public Guid HoldId { get; set; }

    public int ClassId { get; set; }

    public Class? Class { get; set; }

    public Guid MemberId { get; set; }

    /// <summary>Invoice của chu kỳ checkout (thuộc module Payment; chỉ scalar).</summary>
    public Guid? InvoiceId { get; set; }

    public DateTime ExpiresAtUtc { get; set; }

    public SeatHoldStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }
}
