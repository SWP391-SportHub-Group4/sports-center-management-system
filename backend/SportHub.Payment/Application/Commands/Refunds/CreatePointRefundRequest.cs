using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands.Refunds;

public sealed class CreatePointRefundRequest
{
    [Required]
    public Guid InvoiceItemId { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
