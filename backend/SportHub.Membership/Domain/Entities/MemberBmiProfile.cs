using SportHub.Identity.Domain.Entities;

namespace SportHub.Membership.Domain.Entities;

/// <summary>One centre measurement request and immutable result per member.</summary>
public sealed class MemberBmiProfile
{
    public Guid MemberId { get; set; }
    public UserAccount? Member { get; set; }
    public DateTime RequestedAt { get; set; }
    public DateTime? AppointmentAt { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? WeightKg { get; set; }
    public DateTime? MeasuredAt { get; set; }
    public Guid? RecordedById { get; set; }
}
