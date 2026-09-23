using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands;

public sealed class RecordPaymentRequest
{
    [Range(1, 1_000_000_000)]
    public decimal Amount { get; set; }

    /// <summary>Tên member của enum PaymentMethod (SSOT §3): Cash/Card/Transfer/EWallet.</summary>
    [Required]
    public string Method { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ReferenceCode { get; set; }
}
