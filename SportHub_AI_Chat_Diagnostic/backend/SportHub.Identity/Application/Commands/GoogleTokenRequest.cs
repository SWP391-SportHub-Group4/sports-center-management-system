using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public sealed class GoogleTokenRequest
{
    [Required]
    public string IdToken { get; set; } = string.Empty;
}
