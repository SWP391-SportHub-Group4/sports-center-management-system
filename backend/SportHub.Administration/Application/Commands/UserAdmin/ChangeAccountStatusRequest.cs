using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Commands;

/// <summary>BR-6/BR-7 — khoá/mở khoá BẮT BUỘC kèm lý do.</summary>
public sealed class ChangeAccountStatusRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
