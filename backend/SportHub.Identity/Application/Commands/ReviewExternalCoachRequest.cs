using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Manager duyệt/từ chối/đình chỉ/mở lại ExternalCoach. Ghi chú bắt buộc khi từ chối và đình chỉ (kiểm ở service).</summary>
public sealed class ReviewExternalCoachRequest
{
    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed class UpdateExternalCoachProfileRequest
{
    [MaxLength(1000)]
    public string? Bio { get; set; }
}
