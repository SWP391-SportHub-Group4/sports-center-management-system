namespace SportHub.API.Persistence;

/// <summary>A Manager's read receipt for a request in the composed request inbox.</summary>
public sealed class ManagerRequestReadReceipt
{
    public Guid ManagerId { get; set; }
    public string RequestType { get; set; } = string.Empty;
    public Guid RequestId { get; set; }
    public DateTime ReadAtUtc { get; set; }
}
