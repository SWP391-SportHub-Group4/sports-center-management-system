namespace SportHub.Administration.Domain.Entities;

public sealed class LandingPageContent
{
    public int Id { get; set; } = 1;
    public string ValuesJson { get; set; } = "{}";
    public Guid Revision { get; set; }
    public DateTime UpdatedAt { get; set; }
}
