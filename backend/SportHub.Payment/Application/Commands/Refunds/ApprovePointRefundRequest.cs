using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands.Refunds;

public sealed class ApprovePointRefundRequest
{
    public bool CenterFault { get; set; }

    /// <summary>Ngoại lệ do Manager quyết định (ví dụ Coach dạy chưa đạt): % giá trị thực trả được hoàn, thay cho mức theo quy tắc.</summary>
    [Range(0, 100)]
    public int? Percent { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
