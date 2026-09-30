using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Lớp kiểm tra "Coach này làm được nghiệp vụ PT" (BR-99/100) thay cho CoachCategory.PersonalTrainer: Coach nội bộ đang Active
/// có chuyên môn ở ít nhất một môn dạng 1-1 (OneOnOne) đang hoạt động. Luôn đọc từ DB qua port, không tin JWT.
/// Ownership và quan hệ Active với hội viên vẫn do service nghiệp vụ kiểm riêng.
/// </summary>
public sealed class PersonalTrainerGuard(ICoachSpecialtyReader specialties)
{
    public async Task RequireAsync(Guid coachId, CancellationToken ct = default)
    {
        if (!await specialties.IsPersonalTrainerAsync(coachId, ct))
        {
            throw new ForbiddenException(
                "personal_trainer_required",
                "Chức năng này chỉ dành cho Coach có chuyên môn huấn luyện cá nhân (PT 1-1).");
        }
    }
}
