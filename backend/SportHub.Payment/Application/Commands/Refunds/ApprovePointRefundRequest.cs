using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands.Refunds;

public sealed class ApprovePointRefundRequest
{
    public bool CenterFault { get; set; }

    /// <summary>Optional percentage of the remaining paid value; cannot exceed the system-calculated points.</summary>
    [Range(0, 100)]
    public int? Percent { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
