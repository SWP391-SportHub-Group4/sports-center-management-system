using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.DTOs;

namespace SportHub.Payment.Application.Interfaces;

public interface IRevenueReportService
{
    Task<RevenueReportResponse> GetAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default);
}
