using System.Text.RegularExpressions;

namespace SportHub.AI.Application.Services;

/// <summary>Converts AI chat output to plain text before it is logged or returned.</summary>
public static class AiPlainTextSanitizer
{
    public static string Clean(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;

        var text = input.Replace("\r\n", "\n").Replace('\r', '\n');
        // Keep the target text and URL rather than the Markdown link syntax.
        text = Regex.Replace(text, @"\[([^\]]+)\]\(([^)]+)\)", "$1 ($2)");
        text = Regex.Replace(text, @"(?m)^[ \t]*`{3,}[^\n]*$", "");
        text = Regex.Replace(text, @"(?m)^[ \t]{0,3}#{1,6}[ \t]*", "");
        text = Regex.Replace(text, @"(?m)^[ \t]*>[ \t]?", "");
        text = Regex.Replace(text, @"(?m)^[ \t]*[-+*][ \t]+", "");
        // Strict product requirement: neither character may appear in chat output.
        text = text.Replace("*", "").Replace("#", "").Replace("`", "").Replace("~", "");
        text = Regex.Replace(text, @"(?m)[ \t]+$", "");
        text = Regex.Replace(text, @"\n{3,}", "\n\n");
        return text.Trim();
    }
}
