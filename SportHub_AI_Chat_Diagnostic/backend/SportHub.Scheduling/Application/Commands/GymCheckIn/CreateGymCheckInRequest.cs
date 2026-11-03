using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

// Body của POST /api/gym-checkins chỉ nhận đúng targetMemberId.
//
// Cố ý KHÔNG có checkedInByUserId và checkInTime: người thực hiện lấy từ claim của JWT,
// thời điểm lấy từ đồng hồ server — nếu nhận từ payload thì Lễ tân có thể ghi khống
// người check-in hoặc lùi/tiến giờ.
public sealed class CreateGymCheckInRequest
{
    [Required(ErrorMessage = "targetMemberId is required.")]
    public Guid? TargetMemberId { get; set; }
}
