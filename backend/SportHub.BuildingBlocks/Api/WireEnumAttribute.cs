using System.Text.Json;
using System.Text.Json.Serialization;

namespace SportHub.BuildingBlocks.Api;

/// <summary>Marks enum-valued strings in API contracts. Domain/DB/JWT values are unchanged.</summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class WireEnumAttribute : JsonConverterAttribute
{
    public override JsonConverter CreateConverter(Type typeToConvert) => new WireEnumStringConverter();
}

public sealed class WireEnumStringConverter : JsonConverter<string>
{
    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => WireEnum.ToInternalName(reader.GetString());

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        => writer.WriteStringValue(JsonNamingPolicy.SnakeCaseUpper.ConvertName(value));
}

public static class WireEnum
{
    // PascalCase remains accepted during migration; canonical JSON is UPPER_SNAKE_CASE.
    public static string? ToInternalName(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Any(char.IsLower)) return value;
        if (value == "PT") return "PT";
        if (value == "VN_PAY" || value == "VNPAY") return "VnPay";
        return string.Concat(value.Split('_').Select(part => part.Length == 0 ? ""
            : char.ToUpperInvariant(part[0]) + part[1..].ToLowerInvariant()));
    }

    public static bool TryParse<T>(string? value, bool ignoreCase, out T result) where T : struct, Enum
    {
        foreach (var name in Enum.GetNames<T>())
        {
            var comparison = ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
            if (string.Equals(value, name, comparison)
                || string.Equals(value, JsonNamingPolicy.SnakeCaseUpper.ConvertName(name), comparison))
                return Enum.TryParse(name, out result);
        }
        result = default;
        return false;
    }
}
