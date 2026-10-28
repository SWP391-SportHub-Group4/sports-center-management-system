namespace SportHub.Identity.Infrastructure.Email;

public sealed class BrevoEmailOptions
{
    public const string SectionName = "Email:Brevo";
    public string ApiKey { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "SportHub";
}
