using SportHub.Membership.Domain.Enums;

namespace SportHub.Membership.Domain.Rules;

/// <summary>Công thức sức khỏe dùng chung cho hồ sơ hội viên và gợi ý AI. Chỉ ước tính, không phải chẩn đoán.</summary>
public static class BodyMetrics
{
    public const string Underweight = "Underweight";
    public const string Normal = "Normal";
    public const string Overweight = "Overweight";
    public const string Obese = "Obese";

    public static decimal Bmi(decimal heightCm, decimal weightKg)
    {
        var m = heightCm / 100m;
        return Math.Round(weightKg / (m * m), 1, MidpointRounding.AwayFromZero);
    }

    /// <summary>Ngưỡng người trưởng thành của WHO: &lt;18.5, &lt;25, &lt;30, còn lại.</summary>
    public static string Category(decimal bmi)
        => bmi < 18.5m ? Underweight : bmi < 25m ? Normal : bmi < 30m ? Overweight : Obese;

    public static int AgeOn(DateOnly dateOfBirth, DateOnly today)
    {
        var age = today.Year - dateOfBirth.Year;
        return dateOfBirth.AddYears(age) > today ? age - 1 : age;
    }

    /// <summary>Năng lượng nền theo Mifflin-St Jeor (kcal/ngày); Unspecified lấy giá trị giữa nam và nữ.</summary>
    public static int Bmr(BiologicalSex sex, int age, decimal heightCm, decimal weightKg)
    {
        var baseValue = 10m * weightKg + 6.25m * heightCm - 5m * age;
        var offset = sex switch { BiologicalSex.Male => 5m, BiologicalSex.Female => -161m, _ => -78m };
        return (int)Math.Round(baseValue + offset, MidpointRounding.AwayFromZero);
    }

    public static decimal ActivityFactor(ActivityLevel level) => level switch
    {
        ActivityLevel.Sedentary => 1.2m,
        ActivityLevel.LightlyActive => 1.375m,
        ActivityLevel.ModeratelyActive => 1.55m,
        _ => 1.725m
    };
}
