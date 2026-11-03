using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassEnrollmentReportService
{
    Task<ClassEnrollmentReportResponse> GetAsync(DateOnly fromDate, DateOnly toDate, int? sportId, CancellationToken ct = default);
}
