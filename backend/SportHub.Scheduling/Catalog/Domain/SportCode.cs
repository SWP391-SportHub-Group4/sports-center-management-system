using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SportHub.Scheduling.Catalog.Domain;

public static partial class SportCode
{
    public static string FromName(string name)
    {
        var normalized = name.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var text = new StringBuilder();
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
                text.Append(character == 'đ' ? 'd' : character);
        }
        var code = Separators().Replace(text.ToString(), "_").Trim('_');
        return code[..Math.Min(code.Length, 32)].TrimEnd('_');
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex Separators();
}
