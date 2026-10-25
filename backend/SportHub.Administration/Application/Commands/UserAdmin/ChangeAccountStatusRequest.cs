using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Commands;

/// <summary>BR-6/BR-7 — activating or deactivating an account requires a reason.</summary>
public sealed class ChangeAccountStatusRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
