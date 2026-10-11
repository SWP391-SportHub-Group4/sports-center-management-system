using System.ComponentModel.DataAnnotations;

namespace SportHub.Notification.Application.DTOs;

public sealed class ManualNoticeRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public IReadOnlyList<Guid> RecipientUserIds { get; set; } = [];

    [Required, MinLength(3), MaxLength(150)]
    public string Subject { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(3_000)]
    public string Message { get; set; } = string.Empty;

    public bool SendInApp { get; set; } = true;
    public bool SendEmail { get; set; } = true;
}
