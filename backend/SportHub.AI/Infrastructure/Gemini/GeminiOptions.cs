namespace SportHub.AI.Infrastructure.Gemini;

public sealed class GeminiOptions
{
    public const string SectionName = "Gemini";

    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = "gemini-3.5-flash-lite";

    public string BaseUrl { get; set; }
        = "https://generativelanguage.googleapis.com";

    public int TimeoutSeconds { get; set; } = 30;
}