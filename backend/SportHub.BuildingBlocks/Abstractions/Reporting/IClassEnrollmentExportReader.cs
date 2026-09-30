namespace SportHub.BuildingBlocks.Abstractions.Reporting;

public interface IClassEnrollmentExportReader
{
    Task<IReadOnlyList<IReadOnlyDictionary<string, string>>> ReadAsync(
        DateOnly fromDate, DateOnly toDate, int? sportId, CancellationToken ct = default);
}
