using SportHub.Identity.Domain.Entities;

namespace SportHub.Membership.Domain.Entities;

/// <summary>
/// Một lần hội viên tự khai chiều cao/cân nặng. Chỉ ghi thêm khi số đo đổi (không sửa, không xóa) để Coach xem
/// xu hướng cân nặng; số đo hiện tại nằm ở <see cref="MemberTrainingProfile"/>.
/// </summary>
public sealed class MemberBodyMeasurement
{
    public Guid MeasurementId { get; set; }
    public Guid MemberId { get; set; }
    public UserAccount? Member { get; set; }
    public decimal HeightCm { get; set; }
    public decimal WeightKg { get; set; }
    public DateTime MeasuredAt { get; set; }
}
