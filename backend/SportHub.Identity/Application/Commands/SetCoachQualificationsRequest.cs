using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public sealed class SetCoachQualificationsRequest
{
    /// <summary>OfferingId của dịch vụ (thay toàn bộ). Hiện chỉ nhận offering PT của Gym.</summary>
    [Required, MaxLength(20)]
    public List<int> OfferingIds { get; set; } = [];
}
