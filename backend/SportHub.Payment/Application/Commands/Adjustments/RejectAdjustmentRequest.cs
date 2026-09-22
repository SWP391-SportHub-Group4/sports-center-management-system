using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands;

public sealed class RejectAdjustmentRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
