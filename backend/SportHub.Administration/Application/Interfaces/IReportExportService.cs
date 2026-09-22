using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Services;
using SportHub.Administration.Infrastructure;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using System.Text;

namespace SportHub.Administration.Application.Interfaces;

public interface IReportExportService
{
    Task<PagedResult<ReportExportResponse>> SearchAsync(
        Guid actorUserId, bool actorIsCenterManager, int page, int pageSize, CancellationToken ct = default);

    Task<ReportExportResponse> CreateAsync(
        CreateReportExportRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<(string FileName, byte[] Content)> DownloadAsync(
        Guid reportExportId, Guid actorUserId, bool actorIsCenterManager, CancellationToken ct = default);

    Task DeleteAsync(Guid reportExportId, Guid actorUserId, bool actorIsCenterManager, CancellationToken ct = default);

    Task<ReportExportResponse> RetryAsync(Guid reportExportId, Guid actorUserId, CancellationToken ct = default);
}
