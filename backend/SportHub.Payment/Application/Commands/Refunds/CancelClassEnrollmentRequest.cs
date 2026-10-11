using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands.Refunds;

public sealed class CancelClassEnrollmentRequest
{
    [Required]
    public Guid InvoiceItemId { get; set; }
}
