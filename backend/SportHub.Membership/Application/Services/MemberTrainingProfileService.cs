using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Application.Commands;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Membership.Application.Services;

/// <summary>
/// Hồ sơ sức khỏe và tập luyện của hội viên, do hội viên tự khai. Đây là đầu vào của gợi ý AI (BR-26): mục tiêu,
/// trình độ, chỉ số cơ thể, mức vận động, lịch tập mong muốn, chế độ ăn và hạn chế sức khỏe.
///
/// Quan hệ 1–1 với UserAccount nên dùng upsert. Mỗi lần chiều cao/cân nặng đổi, một dòng lịch sử được thêm để Coach
/// xem xu hướng; dữ liệu là tự khai nên không khóa chỉnh sửa như số đo tại trung tâm trước đây.
/// </summary>
public sealed class MemberTrainingProfileService(ISportHubDbContext db, IClock clock)
    : IMemberTrainingProfileService
{
    private const int HistoryLimit = 12;
    private const int MinAge = 14;
    private const int MaxAge = 90;

    public async Task<MemberTrainingProfileResponse?> GetAsync(Guid memberId, CancellationToken ct = default)
    {
        var profile = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .SingleOrDefaultAsync(p => p.MemberId == memberId, ct);
        return profile is null ? null : await ToResponseAsync(profile, ct);
    }

    public async Task<MemberTrainingProfileResponse> SaveAsync(
        Guid memberId,
        SaveTrainingProfileRequest request,
        CancellationToken ct = default)
    {
        var goalType = Parse<TrainingGoalType>(request.GoalType, "invalid_goal_type");
        var level = Parse<ExperienceLevel>(request.ExperienceLevel, "invalid_experience_level");
        var sex = Parse<BiologicalSex>(request.Sex, "invalid_sex");
        var activity = Parse<ActivityLevel>(request.ActivityLevel, "invalid_activity_level");
        var diet = string.IsNullOrWhiteSpace(request.DietaryPreference)
            ? DietaryPreference.NoPreference
            : Parse<DietaryPreference>(request.DietaryPreference, "invalid_dietary_preference");

        var today = VietnamTime.TodayLocal(clock);
        var dob = request.DateOfBirth!.Value;
        var age = dob > today ? -1 : BodyMetrics.AgeOn(dob, today);
        if (age is < MinAge or > MaxAge)
            throw new BadRequestException("invalid_date_of_birth", $"Age must be between {MinAge} and {MaxAge}.");

        var height = request.HeightCm!.Value;
        var weight = request.WeightKg!.Value;
        RequireOneDecimal(height, "invalid_height");
        RequireOneDecimal(weight, "invalid_weight");
        if (request.TargetWeightKg is { } target)
        {
            RequireOneDecimal(target, "invalid_target_weight");
            // Mục tiêu dưới BMI 18.5 sẽ khiến gợi ý cắt năng lượng trên người đã thiếu cân.
            if (BodyMetrics.Bmi(height, target) < 18.5m)
                throw new BadRequestException("target_weight_unsafe",
                    "Target weight would put your BMI below 18.5. Choose a higher target or speak with your coach.");
        }

        var profile = await db.Set<MemberTrainingProfile>().SingleOrDefaultAsync(p => p.MemberId == memberId, ct);
        if (profile is null)
        {
            profile = new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = memberId };
            db.Set<MemberTrainingProfile>().Add(profile);
        }

        profile.Goal = request.Goal.Trim();
        profile.GoalType = goalType;
        profile.ExperienceLevel = level;
        profile.DateOfBirth = dob;
        profile.Sex = sex;
        profile.HeightCm = height;
        profile.WeightKg = weight;
        profile.TargetWeightKg = request.TargetWeightKg;
        profile.ActivityLevel = activity;
        profile.TrainingDaysPerWeek = request.TrainingDaysPerWeek;
        profile.SessionMinutes = request.SessionMinutes;
        profile.DietaryPreference = diet;
        profile.FoodAllergies = string.IsNullOrWhiteSpace(request.FoodAllergies) ? null : request.FoodAllergies.Trim();
        profile.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        // BR-26 dựa vào hồ sơ này; UpdatedAt cho Coach biết hồ sơ có còn mới hay đã cũ.
        profile.UpdatedAt = clock.UtcNow;

        var last = await db.Set<MemberBodyMeasurement>().AsNoTracking()
            .Where(x => x.MemberId == memberId).OrderByDescending(x => x.MeasuredAt)
            .Select(x => new { x.HeightCm, x.WeightKg }).FirstOrDefaultAsync(ct);
        if (last is null || last.HeightCm != height || last.WeightKg != weight)
        {
            db.Set<MemberBodyMeasurement>().Add(new MemberBodyMeasurement
            {
                MeasurementId = Guid.NewGuid(), MemberId = memberId,
                HeightCm = height, WeightKg = weight, MeasuredAt = profile.UpdatedAt
            });
        }

        await db.SaveChangesAsync(ct);
        return await ToResponseAsync(profile, ct);
    }

    private async Task<MemberTrainingProfileResponse> ToResponseAsync(MemberTrainingProfile p, CancellationToken ct)
    {
        var history = await db.Set<MemberBodyMeasurement>().AsNoTracking()
            .Where(x => x.MemberId == p.MemberId).OrderByDescending(x => x.MeasuredAt).Take(HistoryLimit)
            .Select(x => new { x.MeasuredAt, x.HeightCm, x.WeightKg }).ToListAsync(ct);
        decimal? bmi = p.HeightCm is { } h && p.WeightKg is { } w ? BodyMetrics.Bmi(h, w) : null;
        int? age = p.DateOfBirth is { } dob ? BodyMetrics.AgeOn(dob, VietnamTime.TodayLocal(clock)) : null;
        var complete = p.GoalType is not null && p.DateOfBirth is not null && p.Sex is not null && bmi is not null
            && p.ActivityLevel is not null && p.TrainingDaysPerWeek is not null;
        return new MemberTrainingProfileResponse(
            p.MemberId, p.Goal, p.GoalType?.ToString(), p.ExperienceLevel.ToString(), p.Notes, p.UpdatedAt,
            p.DateOfBirth, age, p.Sex?.ToString(), p.HeightCm, p.WeightKg, p.TargetWeightKg,
            bmi, bmi is { } b ? BodyMetrics.Category(b) : null, p.ActivityLevel?.ToString(),
            p.TrainingDaysPerWeek, p.SessionMinutes, p.DietaryPreference.ToString(), p.FoodAllergies, complete,
            [.. history.Select(x => new BodyMeasurementResponse(x.MeasuredAt, x.HeightCm, x.WeightKg,
                BodyMetrics.Bmi(x.HeightCm, x.WeightKg)))]);
    }

    private static T Parse<T>(string? value, string code) where T : struct, Enum
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<T>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException(code, $"Invalid {typeof(T).Name}.");

    private static void RequireOneDecimal(decimal value, string code)
    {
        if (decimal.Round(value, 1) != value)
            throw new BadRequestException(code, "Use at most one decimal place.");
    }
}
