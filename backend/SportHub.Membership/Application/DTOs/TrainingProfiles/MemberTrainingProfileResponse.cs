namespace SportHub.Membership.Application.DTOs;

public sealed record BodyMeasurementResponse(DateTime MeasuredAt, decimal HeightCm, decimal WeightKg, decimal Bmi);

public sealed record MemberTrainingProfileResponse(
    Guid MemberId,
    string Goal,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? GoalType,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ExperienceLevel,
    string? Notes,
    DateTime UpdatedAt,
    DateOnly? DateOfBirth,
    int? Age,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? Sex,
    decimal? HeightCm,
    decimal? WeightKg,
    decimal? TargetWeightKg,
    decimal? Bmi,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? BmiCategory,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? ActivityLevel,
    int? TrainingDaysPerWeek,
    int? SessionMinutes,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string DietaryPreference,
    string? FoodAllergies,
    /// <summary>Đủ các trường bắt buộc để AI tính BMI, năng lượng và lịch tập; hồ sơ cũ có thể false.</summary>
    bool IsComplete,
    IReadOnlyList<BodyMeasurementResponse> RecentMeasurements,
    string? BodyBuild = null);
