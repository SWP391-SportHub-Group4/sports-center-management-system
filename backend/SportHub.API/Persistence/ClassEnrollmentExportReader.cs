using System.Globalization;
using SportHub.BuildingBlocks.Abstractions.Reporting;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.API.Persistence;

public sealed class ClassEnrollmentExportReader(IClassEnrollmentReportService reports) : IClassEnrollmentExportReader
{
    public async Task<IReadOnlyList<IReadOnlyDictionary<string, string>>> ReadAsync(
        DateOnly fromDate, DateOnly toDate, int? sportId, CancellationToken ct = default)
    {
        var report = await reports.GetAsync(fromDate, toDate, sportId, ct);
        return report.Classes.Select(x => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
        {
            ["classId"] = x.ClassId.ToString(CultureInfo.InvariantCulture), ["code"] = x.Code,
            ["name"] = x.Name, ["sportId"] = x.SportId.ToString(CultureInfo.InvariantCulture),
            ["sportName"] = x.SportName, ["status"] = x.Status,
            ["capacity"] = x.Capacity.ToString(CultureInfo.InvariantCulture),
            ["confirmedCount"] = x.ConfirmedCount.ToString(CultureInfo.InvariantCulture),
            ["activeHoldCount"] = x.ActiveHoldCount.ToString(CultureInfo.InvariantCulture),
            ["availableSeats"] = x.AvailableSeats.ToString(CultureInfo.InvariantCulture),
            ["fillRatio"] = x.FillRatio.ToString(CultureInfo.InvariantCulture),
            ["breakEvenThreshold"] = x.BreakEvenThreshold?.ToString(CultureInfo.InvariantCulture) ?? "",
            ["thresholdStatus"] = x.ThresholdStatus,
            ["firstSessionStartUtc"] = x.FirstSessionStartUtc?.ToString("O", CultureInfo.InvariantCulture) ?? ""
        }).ToList();
    }
}
