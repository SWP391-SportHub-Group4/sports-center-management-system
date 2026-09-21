using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Application.DTOs;

namespace SportHub.Membership.Application.Services;

public interface IMemberTrainingProfileService
{
    Task<MemberTrainingProfileDto?> GetAsync(Guid memberId, CancellationToken ct = default);

    Task<MemberTrainingProfileDto> SaveAsync(Guid memberId, SaveTrainingProfileRequest request, CancellationToken ct = default);
}

/// <summary>
/// Hồ sơ tập luyện của hội viên — hai trong ba đầu vào bắt buộc của gợi ý AI (BR-26:
/// mục tiêu cá nhân + trình độ hiện tại; đầu vào thứ ba là lịch sử tập 30 ngày).
///
/// Quan hệ 1–1 với UserAccount nên dùng upsert: không có khái niệm "tạo hồ sơ thứ hai".
/// </summary>
public sealed class MemberTrainingProfileService(ISportHubDbContext db, IClock clock)
    : IMemberTrainingProfileService
{
    public Task<MemberTrainingProfileDto?> GetAsync(Guid memberId, CancellationToken ct = default)
        => db.Set<MemberTrainingProfile>()
            .AsNoTracking()
            .Where(p => p.MemberId == memberId)
            .Select(p => new MemberTrainingProfileDto(
                p.MemberId, p.Goal, p.ExperienceLevel.ToString(), p.Notes, p.UpdatedAt))
            .SingleOrDefaultAsync(ct);

    public async Task<MemberTrainingProfileDto> SaveAsync(
        Guid memberId,
        SaveTrainingProfileRequest request,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<ExperienceLevel>(request.ExperienceLevel, ignoreCase: true, out var level))
        {
            throw new BadRequestException(
                "invalid_experience_level",
                $"Trình độ không hợp lệ: '{request.ExperienceLevel}'. Hợp lệ: Beginner, Intermediate, Advanced.");
        }

        var profile = await db.Set<MemberTrainingProfile>().SingleOrDefaultAsync(p => p.MemberId == memberId, ct);

        if (profile is null)
        {
            profile = new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = memberId };
            db.Set<MemberTrainingProfile>().Add(profile);
        }

        profile.Goal = request.Goal.Trim();
        profile.ExperienceLevel = level;
        profile.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        // BR-26 dựa vào hồ sơ này; UpdatedAt cho Coach biết hồ sơ có còn mới hay đã cũ.
        profile.UpdatedAt = clock.UtcNow;

        await db.SaveChangesAsync(ct);

        return new MemberTrainingProfileDto(
            profile.MemberId, profile.Goal, profile.ExperienceLevel.ToString(), profile.Notes, profile.UpdatedAt);
    }
}
