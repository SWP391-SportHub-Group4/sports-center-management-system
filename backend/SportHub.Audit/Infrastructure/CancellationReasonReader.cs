using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Audit.Infrastructure;

public sealed class CancellationReasonReader(ISportHubDbContext db) : ICancellationReasonReader
{
    public async Task<IReadOnlyDictionary<string, string>> ReadAsync(string targetEntity,
        IReadOnlyCollection<string> targetIds, CancellationToken ct = default)
    {
        var action = targetEntity switch {
            "ClassSession" => "CANCEL_CLASS_SESSION", "Class" => "CANCEL_CLASS", _ => null
        };
        if (action is null || targetIds.Count == 0) return new Dictionary<string, string>();
        var rows = await db.Set<AuditLog>().AsNoTracking()
            .Where(log => log.TargetEntity == targetEntity && log.Action == action && targetIds.Contains(log.TargetId))
            .OrderByDescending(log => log.Timestamp).ThenByDescending(log => log.AuditId)
            .Select(log => new { log.TargetId, log.NewValue }).ToListAsync(ct);
        var reasons = new Dictionary<string, string>();
        foreach (var row in rows)
        {
            if (reasons.ContainsKey(row.TargetId) || row.NewValue is null) continue;
            try
            {
                using var json = JsonDocument.Parse(row.NewValue);
                if (json.RootElement.ValueKind == JsonValueKind.Object &&
                    json.RootElement.TryGetProperty("reason", out var value) && value.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrWhiteSpace(value.GetString())) reasons[row.TargetId] = value.GetString()!;
            }
            catch (JsonException) { /* Older receipts may not contain structured reasons. */ }
        }
        return reasons;
    }
}
