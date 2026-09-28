using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassUtilizationReportService
{
    Task<ClassUtilizationReportResponse> GetAsync(
        DateOnly fromDate,
        DateOnly toDate,
        string? discipline,
        CancellationToken ct = default);
}
