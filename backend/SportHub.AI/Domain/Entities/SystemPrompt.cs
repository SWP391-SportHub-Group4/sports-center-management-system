namespace SportHub.AI.Domain.Entities;

/// <summary>One managed prompt per role and category. JSON revision snapshots are updated atomically.</summary>
public sealed class SystemPrompt
{
    public string Id { get; set; } = "";
    public string Audience { get; set; } = "";
    public string? ActivePayload { get; set; }
    public string? DraftPayload { get; set; }
    public string HistoryPayload { get; set; } = "[]";
    public int Revision { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}
