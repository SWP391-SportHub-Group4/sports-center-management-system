using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
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

namespace SportHub.Administration.Application.Services;

public sealed record ReportExportResponse(
    Guid ReportExportId,
    string ReportType,
    Guid RequestedByUserId,
    string RequestedByName,
    string ParametersJson,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    int RowCount,
    long SizeBytes,
    string? FailureReason,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    DateTime ExpiresAt,
    string Format);

public sealed class CreateReportExportRequest
{
    [Required]
    public string ReportType { get; set; } = string.Empty;

    [Required]
    public DateOnly FromDate { get; set; }

    [Required]
    public DateOnly ToDate { get; set; }

    [Required, MinLength(1)]
    public List<string> Columns { get; set; } = [];

    public string? Format { get; set; }
    public int? SportId { get; set; }
    public string? Source { get; set; }
    public Guid? MemberId { get; set; }
}

public sealed class ReportExportService(
    ISportHubDbContext db,
    IReportStorage storage,
    IReportPdfRenderer pdf,
    IAuditWriter audit,
    IClock clock,
    SportHub.Payment.Application.Interfaces.IRevenueReportService revenue,
    SportHub.Membership.Application.Interfaces.IMembershipReportService membership,
    SportHub.BuildingBlocks.Abstractions.Reporting.IClassEnrollmentExportReader classes) : IReportExportService
{
    public const int RetentionMonths = 6;

    private static string DescribeAudit(ReportExport export)
    {
        var snapshot = JsonSerializer.Deserialize<Dictionary<string, object?>>(export.ParametersJson) ?? [];
        snapshot["reportType"] = export.ReportType;
        return JsonSerializer.Serialize(snapshot);
    }

    public async Task<PagedResult<ReportExportResponse>> SearchAsync(
        Guid actorUserId,
        bool actorIsCenterManager,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var query = db.Set<ReportExport>().AsNoTracking().Where(r => !r.IsDeleted);

        if (!actorIsCenterManager)
        {
            query = query.Where(r => r.RequestedByUserId == actorUserId);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(Projection())
            .ToListAsync(ct);

        return new PagedResult<ReportExportResponse>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<ReportExportResponse> CreateAsync(
        CreateReportExportRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var reportType = request.ReportType.Trim().ToUpperInvariant();

        if (!ReportTypes.IsKnown(reportType))
        {
            throw new BadRequestException(
                "unknown_report_type",
                $"Loại báo cáo không hợp lệ: '{request.ReportType}'. Hợp lệ: "
                + string.Join(", ", ReportTypes.AllowedColumns.Keys));
        }

        var allowed = ReportTypes.AllowedColumns[reportType];

        var columns = allowed.Where(request.Columns.Contains).ToList();

        var unknown = request.Columns.Where(c => !allowed.Contains(c)).ToList();

        if (unknown.Count > 0)
        {
            throw new BadRequestException(
                "unknown_report_column",
                $"Cột không hợp lệ cho báo cáo {reportType}: {string.Join(", ", unknown)}. "
                + $"Hợp lệ: {string.Join(", ", allowed)}");
        }

        if (columns.Count == 0)
        {
            throw new BadRequestException("no_columns_selected", "Phải chọn ít nhất một cột để xuất (BR-44).");
        }

        var format = request.Format is null
            ? ReportFormats.Csv
            : ReportFormats.Normalize(request.Format)
              ?? throw new BadRequestException(
                  "unknown_report_format",
                  $"Định dạng không hợp lệ: '{request.Format}'. Hợp lệ: {string.Join(", ", ReportFormats.All)}.");

        var (fromDate, toDate) = request.ToDate < request.FromDate
            ? (request.ToDate, request.FromDate)
            : (request.FromDate, request.ToDate);

        var now = clock.UtcNow;

        var export = new ReportExport
        {
            ReportExportId = Guid.NewGuid(),
            ReportType = reportType,
            RequestedByUserId = actorUserId,
            ParametersJson = JsonSerializer.Serialize(new
            {
                fromDate = fromDate.ToString("yyyy-MM-dd"),
                toDate = toDate.ToString("yyyy-MM-dd"),
                columns,
                sportId = request.SportId,
                source = request.Source,
                memberId = request.MemberId,
                format
            }),
            Format = format,
            Status = ReportExportStatus.Pending,
            CreatedAt = now,
            ExpiresAt = now.AddMonths(RetentionMonths)
        };

        db.Set<ReportExport>().Add(export);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_REPORT_EXPORT", nameof(ReportExport), export.ReportExportId.ToString(),
            NewValue: DescribeAudit(export)));

        await db.SaveChangesAsync(ct);

        await RunAsync(export, fromDate, toDate, columns, request.SportId, ct, request.Source, request.MemberId);

        return await GetOneAsync(export.ReportExportId, ct);
    }

    public async Task<(string FileName, byte[] Content)> DownloadAsync(
        Guid reportExportId,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct = default)
    {
        var export = await LoadForActorAsync(reportExportId, actorUserId, actorIsCenterManager, ct);

        if (export.Status != ReportExportStatus.Completed)
        {
            throw new ConflictException(
                "report_not_ready", $"Báo cáo đang ở trạng thái {export.Status}, chưa tải về được.");
        }

        var content = await storage.ReadAsync(export.ReportExportId, export.Format, ct)
            ?? throw new NotFoundException("report_file_missing", "Tệp báo cáo không còn trên hệ thống.");

        var fileName = $"{export.ReportType.ToLowerInvariant()}-{export.CreatedAt:yyyyMMdd-HHmmss}"
                       + $".{ReportFormats.Extension(export.Format)}";

        return (fileName, content);
    }

    public async Task DeleteAsync(
        Guid reportExportId,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct = default)
    {
        var export = await LoadForActorAsync(reportExportId, actorUserId, actorIsCenterManager, ct);

        export.IsDeleted = true;
        export.DeletedAt = clock.UtcNow;

        await storage.DeleteAsync(reportExportId, export.Format, ct);

        audit.Write(new AuditEntry(
            actorUserId, "DELETE_REPORT_EXPORT", nameof(ReportExport), reportExportId.ToString(),
            OldValue: DescribeAudit(export)));

        await db.SaveChangesAsync(ct);
    }

    public async Task<ReportExportResponse> RetryAsync(
        Guid reportExportId,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var export = await db.Set<ReportExport>()
            .SingleOrDefaultAsync(r => r.ReportExportId == reportExportId && !r.IsDeleted, ct)
            ?? throw new NotFoundException("report_not_found", "Không tìm thấy báo cáo.");

        if (export.RequestedByUserId != actorUserId)
        {
            throw new ForbiddenException("report_not_owned", "Chỉ người tạo mới được thử lại báo cáo này.");
        }

        if (export.Status == ReportExportStatus.Completed)
        {
            return await GetOneAsync(reportExportId, ct);
        }

        var parameters = JsonSerializer.Deserialize<ExportParameters>(export.ParametersJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new ConflictException("report_parameters_corrupt", "Tham số báo cáo không đọc được.");

        export.Status = ReportExportStatus.Pending;
        export.FailureReason = null;
        await db.SaveChangesAsync(ct);

        await RunAsync(
            export,
            DateOnly.ParseExact(parameters.FromDate, "yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly.ParseExact(parameters.ToDate, "yyyy-MM-dd", CultureInfo.InvariantCulture),
            parameters.Columns,
            parameters.SportId,
            ct, parameters.Source, parameters.MemberId);

        return await GetOneAsync(reportExportId, ct);
    }

    private async Task RunAsync(
        ReportExport export,
        DateOnly fromDate,
        DateOnly toDate,
        IReadOnlyList<string> columns,
        int? sportId,
        CancellationToken ct, string? source = null, Guid? memberId = null)
    {
        try
        {
            var rows = export.ReportType switch
            {
                ReportTypes.RevenueDaily => await BuildRevenueDailyRowsAsync(fromDate, toDate, columns, ct),
                ReportTypes.RevenueSummary => await BuildRevenueSummaryRowsAsync(fromDate, toDate, columns, ct),
                ReportTypes.RevenueDimensions or ReportTypes.CourtRentalRevenue => await BuildDimensionRowsAsync(fromDate, toDate, columns, export.ReportType == ReportTypes.CourtRentalRevenue, ct, sportId, source, memberId),
                ReportTypes.MembershipPeriod => await BuildMembershipPeriodRowsAsync(fromDate, toDate, columns, ct),
                ReportTypes.ClassEnrollment => (await classes.ReadAsync(fromDate, toDate, sportId, ct))
                    .Select(row => (IReadOnlyList<string>)columns.Select(c => row[c]).ToList()).ToList(),
                ReportTypes.Revenue => await BuildRevenueRowsAsync(fromDate, toDate, columns, ct),
                ReportTypes.MemberSummary => await BuildMemberSummaryRowsAsync(columns, ct),
                _ => throw new BadRequestException("unknown_report_type", "Loại báo cáo không hợp lệ.")
            };

            var bytes = export.Format == ReportFormats.Pdf
                ? RenderPdf(export, fromDate, toDate, columns, rows)
                : RenderCsv(columns, rows);

            await storage.WriteAsync(export.ReportExportId, export.Format, bytes, ct);

            var completedAt = clock.UtcNow;

            export.Status = ReportExportStatus.Completed;
            export.RowCount = rows.Count;
            export.SizeBytes = bytes.LongLength;
            export.CompletedAt = completedAt;

            export.ExpiresAt = completedAt.AddMonths(RetentionMonths);
            export.FailureReason = null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            export.Status = ReportExportStatus.Failed;
            export.FailureReason = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            export.CompletedAt = clock.UtcNow;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> BuildRevenueSummaryRowsAsync(
        DateOnly from, DateOnly to, IReadOnlyList<string> columns, CancellationToken ct)
    {
        var report = await revenue.GetAsync(from, to, ct);
        return [columns.Select(column => column switch
        {
            "fromDate" => report.FromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "toDate" => report.ToDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "collectedAmount" => report.TotalCollected.ToString(CultureInfo.InvariantCulture),
            "refundedAmount" => report.TotalRefunded.ToString(CultureInfo.InvariantCulture),
            "netCollected" => report.NetRevenue.ToString(CultureInfo.InvariantCulture),
            "legacyCashCollected" => report.LegacyCashCollected.ToString(CultureInfo.InvariantCulture),
            "reconciliationCashCollected" => report.ReconciliationCashCollected.ToString(CultureInfo.InvariantCulture),
            "pointsRedeemed" => report.PointsRedeemed.ToString(CultureInfo.InvariantCulture),
            "pointsRedeemedVnd" => report.PointsRedeemedVnd.ToString(CultureInfo.InvariantCulture),
            "pointsIssued" => report.PointsIssued.ToString(CultureInfo.InvariantCulture),
            "managerPointAdjustment" => report.ManagerPointAdjustment.ToString(CultureInfo.InvariantCulture),
            "outstandingPoints" => report.OutstandingPoints.ToString(CultureInfo.InvariantCulture),
            _ => throw new InvalidOperationException($"Unsupported summary column: {column}")
        }).ToList()];
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> BuildRevenueDailyRowsAsync(
        DateOnly fromDate, DateOnly toDate, IReadOnlyList<string> columns, CancellationToken ct)
    {
        var report = await revenue.GetAsync(fromDate, toDate, ct);
        return report.Daily.Select(row => (IReadOnlyList<string>)columns.Select(column => column switch
        {
            "date" => row.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "collectedAmount" => row.Collected.ToString(CultureInfo.InvariantCulture),
            "refundedAmount" => row.Refunded.ToString(CultureInfo.InvariantCulture),
            "obligationReduction" => row.ObligationReduction.ToString(CultureInfo.InvariantCulture),
            "netCollected" => row.Net.ToString(CultureInfo.InvariantCulture),
            "legacyCashCollected" => row.LegacyCashCollected.ToString(CultureInfo.InvariantCulture),
            "reconciliationCashCollected" => row.ReconciliationCashCollected.ToString(CultureInfo.InvariantCulture),
            _ => throw new InvalidOperationException($"Unsupported revenue column: {column}")
        }).ToList()).ToList();
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> BuildDimensionRowsAsync(
        DateOnly from, DateOnly to, IReadOnlyList<string> columns, bool rentalsOnly, CancellationToken ct, int? sportId, string? source, Guid? memberId)
    {
        var report = await revenue.GetAsync(from, to, ct);
        return SportHub.Payment.Application.Services.RevenueDimensionFilter.Apply(report.BySportAndSource, sportId, source, memberId, rentalsOnly)
            .Select(row => (IReadOnlyList<string>)columns.Select(column => column switch
            {
                "source" => row.Source,
                "sportId" => row.SportId?.ToString(CultureInfo.InvariantCulture) ?? "",
                "sportName" => row.SportName ?? "",
                "memberId" => row.MemberId?.ToString() ?? "",
                "collectedAmount" => row.CashCollected.ToString(CultureInfo.InvariantCulture),
                "legacyCashCollected" => row.LegacyCashCollected.ToString(CultureInfo.InvariantCulture),
                "pointsRedeemed" => row.PointsRedeemed.ToString(CultureInfo.InvariantCulture),
                "pointsRedeemedVnd" => (row.PointsRedeemed * 1000m).ToString(CultureInfo.InvariantCulture),
                _ => throw new InvalidOperationException($"Unsupported dimension column: {column}")
            }).ToList()).ToList();
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> BuildMembershipPeriodRowsAsync(
        DateOnly from, DateOnly to, IReadOnlyList<string> columns, CancellationToken ct)
    {
        var report = await membership.GetPeriodAsync(from, to, ct);
        return [columns.Select(column => column switch
        {
            "fromDate" => report.FromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "toDate" => report.ToDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "newMembers" => report.NewMembers.ToString(CultureInfo.InvariantCulture),
            "activeMembersAtPeriodEnd" => report.ActiveMembersAtPeriodEnd.ToString(CultureInfo.InvariantCulture),
            _ => throw new InvalidOperationException($"Unsupported membership column: {column}")
        }).ToList()];
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> BuildRevenueRowsAsync(
        DateOnly fromDate,
        DateOnly toDate,
        IReadOnlyList<string> columns,
        CancellationToken ct)
    {
        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);

        var rows = await db.Set<Invoice>()
            .AsNoTracking()
            .Where(i => i.IssuedAt >= fromUtc && i.IssuedAt < toUtc)
            .OrderBy(i => i.IssuedAt)
            .Select(i => new
            {
                i.InvoiceNumber,
                i.IssuedAt,
                MemberEmail = i.Member!.Email,
                MemberName = i.Member.Profile != null ? i.Member.Profile.FullName : string.Empty,
                i.TotalAmount,
                GrossCollected = i.Payments.Where(p => p.Status == PaymentStatus.Success)
                    .Sum(p => (decimal?)p.Amount) ?? 0m,
                ObligationReduction = i.Adjustments
                    .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                                && a.Type != PaymentAdjustmentType.Refund)
                    .Sum(a => (decimal?)a.Amount) ?? 0m,
                RefundedAmount = i.Adjustments
                    .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                                && a.Type == PaymentAdjustmentType.Refund)
                    .Sum(a => (decimal?)a.Amount) ?? 0m,
                i.Status
            })
            .ToListAsync(ct);

        var table = new List<IReadOnlyList<string>>(rows.Count);

        foreach (var row in rows)
        {
            var balance = new InvoiceBalance(
                row.TotalAmount, row.GrossCollected, row.ObligationReduction, row.RefundedAmount);

            var values = columns.Select(column => column switch
            {
                "invoiceNumber" => row.InvoiceNumber,
                "issuedAt" => VietnamTime.ToLocal(row.IssuedAt).ToString("yyyy-MM-dd HH:mm"),
                "memberEmail" => row.MemberEmail,
                "memberName" => row.MemberName,
                "totalAmount" => row.TotalAmount.ToString("0", CultureInfo.InvariantCulture),
                "collectedAmount" => balance.GrossCollected.ToString("0", CultureInfo.InvariantCulture),
                "obligationReduction" => balance.ObligationReduction.ToString("0", CultureInfo.InvariantCulture),
                "refundedAmount" => balance.RefundedAmount.ToString("0", CultureInfo.InvariantCulture),
                "netCollected" => balance.NetCollected.ToString("0", CultureInfo.InvariantCulture),
                "netPayable" => balance.NetPayable.ToString("0", CultureInfo.InvariantCulture),
                "outstanding" => balance.Outstanding.ToString("0", CultureInfo.InvariantCulture),
                "refundDue" => balance.RefundDue.ToString("0", CultureInfo.InvariantCulture),
                "status" => row.Status.ToString(),
                _ => string.Empty
            });

            table.Add([.. values]);
        }

        return table;
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> BuildMemberSummaryRowsAsync(
        IReadOnlyList<string> columns,
        CancellationToken ct)
    {
        var rows = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking()
            .Where(u => u.Role!.RoleName == Identity.Domain.Enums.UserRole.Member)
            .OrderBy(u => u.Email)
            .Select(u => new
            {
                u.UserId,
                u.Email,
                FullName = u.Profile != null ? u.Profile.FullName : string.Empty,
                Phone = u.Profile != null ? u.Profile.Phone : null,
                u.Status,
                u.CreatedAt
            })
            .ToListAsync(ct);

        var memberIds = rows.Select(r => r.UserId).ToList();

        var packageStats = await db.Set<MemberPackage>()
            .AsNoTracking()
            .Where(mp => memberIds.Contains(mp.MemberId) && mp.Status == MemberPackageStatus.Active)
            .GroupBy(mp => mp.MemberId)
            .Select(g => new
            {
                MemberId = g.Key,
                ActiveCount = g.Count(),
                Remaining = g.Sum(mp => (int?)(mp.RemainingSessions ?? 0)) ?? 0
            })
            .ToDictionaryAsync(x => x.MemberId, ct);

        var spend = await db.Set<Payment.Domain.Entities.Payment>()
            .AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Success && memberIds.Contains(p.Invoice!.MemberId))
            .GroupBy(p => p.Invoice!.MemberId)
            .Select(g => new { MemberId = g.Key, Total = g.Sum(p => p.Amount) })
            .ToDictionaryAsync(x => x.MemberId, x => x.Total, ct);

        var table = new List<IReadOnlyList<string>>(rows.Count);

        foreach (var row in rows)
        {
            var stats = packageStats.GetValueOrDefault(row.UserId);

            var values = columns.Select(column => column switch
            {
                "email" => row.Email,
                "fullName" => row.FullName,
                "phone" => row.Phone ?? string.Empty,
                "status" => row.Status.ToString(),
                "joinedAt" => VietnamTime.ToLocal(row.CreatedAt).ToString("yyyy-MM-dd"),
                "activePackages" => (stats?.ActiveCount ?? 0).ToString(CultureInfo.InvariantCulture),
                "remainingSessions" => (stats?.Remaining ?? 0).ToString(CultureInfo.InvariantCulture),
                "totalSpent" => spend.GetValueOrDefault(row.UserId).ToString("0", CultureInfo.InvariantCulture),
                _ => string.Empty
            });

            table.Add([.. values]);
        }

        return table;
    }

    private async Task<ReportExport> LoadForActorAsync(
        Guid reportExportId,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct)
    {
        var export = await db.Set<ReportExport>()
            .SingleOrDefaultAsync(r => r.ReportExportId == reportExportId, ct)
            ?? throw new NotFoundException("report_not_found", "Không tìm thấy báo cáo.");

        if (export.IsDeleted)
        {
            throw new NotFoundException("report_not_found", "Không tìm thấy báo cáo.");
        }

        if (!actorIsCenterManager && export.RequestedByUserId != actorUserId)
        {
            throw new ForbiddenException("report_not_owned", "Báo cáo này không thuộc về bạn (BR-45).");
        }

        return export;
    }

    private async Task<ReportExportResponse> GetOneAsync(Guid reportExportId, CancellationToken ct)
        => await db.Set<ReportExport>().AsNoTracking()
               .Where(r => r.ReportExportId == reportExportId).Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("report_not_found", "Không tìm thấy báo cáo.");

    private static byte[] RenderCsv(IReadOnlyList<string> columns, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', columns.Select(CsvEscape)));

        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(',', row.Select(CsvEscape)));
        }

        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(builder.ToString())];
    }

    private byte[] RenderPdf(
        ReportExport export,
        DateOnly fromDate,
        DateOnly toDate,
        IReadOnlyList<string> columns,
        IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var numeric = columns
            .Select((column, index) => (column, index))
            .Where(x => ReportColumnLabels.IsNumeric(x.column))
            .Select(x => x.index)
            .ToHashSet();

        var subtitle = export.ReportType != ReportTypes.MemberSummary
            ? $"Kỳ {fromDate:dd/MM/yyyy} – {toDate:dd/MM/yyyy} · {rows.Count} dòng · "
              + $"Xuất lúc {VietnamTime.ToLocal(clock.UtcNow):HH:mm dd/MM/yyyy} (giờ Việt Nam)"
            : $"{rows.Count} hội viên · Xuất lúc {VietnamTime.ToLocal(clock.UtcNow):HH:mm dd/MM/yyyy} (giờ Việt Nam)";

        return pdf.Render(new ReportTable(
            ReportColumnLabels.ReportTitle(export.ReportType),
            subtitle,
            [.. columns.Select(ReportColumnLabels.For)],
            rows,
            numeric));
    }

    private static string CsvEscape(string? value)
    {
        value ??= string.Empty;

        return value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }

    private static System.Linq.Expressions.Expression<Func<ReportExport, ReportExportResponse>> Projection()
        => r => new ReportExportResponse(
            r.ReportExportId,
            r.ReportType,
            r.RequestedByUserId,
            r.RequestedByUser!.Profile != null ? r.RequestedByUser.Profile.FullName : r.RequestedByUser.Email,
            r.ParametersJson,
            r.Status.ToString(),
            r.RowCount,
            r.SizeBytes,
            r.FailureReason,
            r.CreatedAt,
            r.CompletedAt,
            r.ExpiresAt,
            r.Format);

    private sealed record ExportParameters(string FromDate, string ToDate, List<string> Columns, int? SportId = null, string? Source = null, Guid? MemberId = null);
}
