using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Infrastructure;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Administration.Application.Services;

public sealed record ReportExportDto(
    Guid ReportExportId,
    string ReportType,
    Guid RequestedByUserId,
    string RequestedByName,
    string ParametersJson,
    string Status,
    int RowCount,
    long SizeBytes,
    string? FailureReason,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    DateTime ExpiresAt);

public sealed class CreateReportExportRequest
{
    /// <summary>REVENUE hoặc MEMBER_SUMMARY — xem ReportTypes.</summary>
    [Required]
    public string ReportType { get; set; } = string.Empty;

    [Required]
    public DateOnly FromDate { get; set; }

    [Required]
    public DateOnly ToDate { get; set; }

    /// <summary>
    /// BR-44 — tệp xuất CHỈ chứa các trường được chọn rõ ràng trước khi xuất. Bắt buộc,
    /// không có mặc định "xuất hết": mặc định như vậy là bỏ qua chính điều BR-44 yêu cầu.
    /// </summary>
    [Required, MinLength(1)]
    public List<string> Columns { get; set; } = [];
}

public interface IReportExportService
{
    Task<PagedResult<ReportExportDto>> SearchAsync(
        Guid actorUserId, bool actorIsCenterManager, int page, int pageSize, CancellationToken ct = default);

    Task<ReportExportDto> CreateAsync(
        CreateReportExportRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<(string FileName, byte[] Content)> DownloadAsync(
        Guid reportExportId, Guid actorUserId, bool actorIsCenterManager, CancellationToken ct = default);

    Task DeleteAsync(Guid reportExportId, Guid actorUserId, bool actorIsCenterManager, CancellationToken ct = default);

    Task<ReportExportDto> RetryAsync(Guid reportExportId, Guid actorUserId, CancellationToken ct = default);
}

/// <summary>
/// Báo cáo/tệp xuất đã tạo — BR-44 (chỉ cột được chọn), BR-45 (ownership), BR-46 (giữ ≥6 tháng),
/// BR-47 (xoá thì link cũ hết truy cập), BR-48 (trạng thái FAILED + tạo lại).
///
/// MVP chỉ xuất CSV. Phần PDF của BR-48 (≤20 trang trong 15 giây) CHƯA LÀM — xem
/// implementation-decisions.md mục D; không được coi BR-48 là đã đạt.
/// </summary>
public sealed class ReportExportService(
    ISportHubDbContext db,
    IReportStorage storage,
    IAuditWriter audit,
    IClock clock) : IReportExportService
{
    /// <summary>BR-46 — lưu tối thiểu 6 tháng.</summary>
    public const int RetentionMonths = 6;

    public async Task<PagedResult<ReportExportDto>> SearchAsync(
        Guid actorUserId,
        bool actorIsCenterManager,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        // BR-47 — bản ghi đã xoá biến khỏi danh sách.
        var query = db.Set<ReportExport>().AsNoTracking().Where(r => !r.IsDeleted);

        // BR-45 — người dùng chỉ thấy báo cáo do chính mình tạo; Center Manager thấy tất cả.
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

        return new PagedResult<ReportExportDto>(items, page, pageSize, total);
    }

    public async Task<ReportExportDto> CreateAsync(
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

        // Giữ đúng THỨ TỰ trong whitelist, không theo thứ tự client gửi: cột trong file luôn
        // ổn định giữa các lần xuất, dễ so sánh hai báo cáo cùng loại.
        var columns = allowed.Where(request.Columns.Contains).ToList();

        var unknown = request.Columns.Where(c => !allowed.Contains(c)).ToList();

        // Cột lạ bị TỪ CHỐI chứ không bỏ qua im lặng: bỏ qua sẽ sinh ra file thiếu cột mà
        // người dùng tưởng là đã có (BR-44).
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
                columns
            }),
            Status = ReportExportStatus.Pending,
            CreatedAt = now,
            ExpiresAt = now.AddMonths(RetentionMonths)
        };

        db.Set<ReportExport>().Add(export);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_REPORT_EXPORT", nameof(ReportExport), export.ReportExportId.ToString(),
            NewValue: export.ParametersJson));

        await db.SaveChangesAsync(ct);

        await RunAsync(export, fromDate, toDate, columns, ct);

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

        var content = await storage.ReadAsync(export.ReportExportId, ct)
            ?? throw new NotFoundException("report_file_missing", "Tệp báo cáo không còn trên hệ thống.");

        return ($"{export.ReportType.ToLowerInvariant()}-{export.CreatedAt:yyyyMMdd-HHmmss}.csv", content);
    }

    public async Task DeleteAsync(
        Guid reportExportId,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct = default)
    {
        var export = await LoadForActorAsync(reportExportId, actorUserId, actorIsCenterManager, ct);

        // BR-47 — soft delete bản ghi VÀ xoá file: chỉ ẩn bản ghi mà giữ file thì "liên kết
        // trước đó" vẫn còn dữ liệu ở sau nó.
        export.IsDeleted = true;
        export.DeletedAt = clock.UtcNow;

        await storage.DeleteAsync(reportExportId, ct);

        audit.Write(new AuditEntry(
            actorUserId, "DELETE_REPORT_EXPORT", nameof(ReportExport), reportExportId.ToString(),
            OldValue: export.ParametersJson));

        await db.SaveChangesAsync(ct);
    }

    /// <summary>BR-48 — cho người dùng tạo lại báo cáo đã FAILED.</summary>
    public async Task<ReportExportDto> RetryAsync(
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

        var parameters = JsonSerializer.Deserialize<ExportParameters>(export.ParametersJson)
            ?? throw new ConflictException("report_parameters_corrupt", "Tham số báo cáo không đọc được.");

        export.Status = ReportExportStatus.Pending;
        export.FailureReason = null;
        await db.SaveChangesAsync(ct);

        await RunAsync(
            export,
            DateOnly.ParseExact(parameters.FromDate, "yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly.ParseExact(parameters.ToDate, "yyyy-MM-dd", CultureInfo.InvariantCulture),
            parameters.Columns,
            ct);

        return await GetOneAsync(reportExportId, ct);
    }

    /// <summary>
    /// Sinh file. Chạy ĐỒNG BỘ trong request ở MVP: khối lượng dữ liệu của một trung tâm đủ
    /// nhỏ để xong trong vài trăm ms, và làm bất đồng bộ sẽ cần thêm hàng đợi + cơ chế theo
    /// dõi tiến độ mà BR không yêu cầu. Trạng thái Pending/Failed vẫn được lưu đúng để BR-48
    /// có chỗ bám khi sau này chuyển sang chạy nền.
    /// </summary>
    private async Task RunAsync(
        ReportExport export,
        DateOnly fromDate,
        DateOnly toDate,
        IReadOnlyList<string> columns,
        CancellationToken ct)
    {
        try
        {
            var csv = export.ReportType switch
            {
                ReportTypes.Revenue => await BuildRevenueCsvAsync(fromDate, toDate, columns, ct),
                ReportTypes.MemberSummary => await BuildMemberSummaryCsvAsync(columns, ct),
                _ => throw new BadRequestException("unknown_report_type", "Loại báo cáo không hợp lệ.")
            };

            // BOM UTF-8 để Excel trên Windows không hiển thị sai dấu tiếng Việt.
            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.Content)).ToArray();

            await storage.WriteAsync(export.ReportExportId, bytes, ct);

            export.Status = ReportExportStatus.Completed;
            export.RowCount = csv.RowCount;
            export.SizeBytes = bytes.LongLength;
            export.CompletedAt = clock.UtcNow;
            export.FailureReason = null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // BR-48 — gián đoạn thì ghi FAILED và cho thử lại, KHÔNG xoá bản ghi đi:
            // xoá đi thì người dùng không còn gì để bấm "thử lại".
            export.Status = ReportExportStatus.Failed;
            export.FailureReason = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            export.CompletedAt = clock.UtcNow;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task<(string Content, int RowCount)> BuildRevenueCsvAsync(
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
                Collected = i.Payments.Where(p => p.Status == PaymentStatus.Success)
                    .Sum(p => (decimal?)p.Amount) ?? 0m,
                Adjusted = i.Adjustments.Where(a => a.Status == PaymentAdjustmentStatus.Completed)
                    .Sum(a => (decimal?)a.Amount) ?? 0m,
                i.Status,
                i.DueDateUtc
            })
            .ToListAsync(ct);

        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', columns.Select(CsvEscape)));

        foreach (var row in rows)
        {
            var balance = new InvoiceBalance(row.TotalAmount, row.Adjusted, row.Collected);

            var values = columns.Select(column => column switch
            {
                "invoiceNumber" => row.InvoiceNumber,
                "issuedAt" => VietnamTime.ToLocal(row.IssuedAt).ToString("yyyy-MM-dd HH:mm"),
                "memberEmail" => row.MemberEmail,
                "memberName" => row.MemberName,
                "totalAmount" => row.TotalAmount.ToString("0", CultureInfo.InvariantCulture),
                "collectedAmount" => balance.TotalCollected.ToString("0", CultureInfo.InvariantCulture),
                "adjustmentAmount" => balance.CompletedAdjustments.ToString("0", CultureInfo.InvariantCulture),
                "netAmount" => (balance.TotalCollected - balance.CompletedAdjustments)
                    .ToString("0", CultureInfo.InvariantCulture),
                "status" => row.Status.ToString(),
                "dueDate" => VietnamTime.ToLocal(row.DueDateUtc).ToString("yyyy-MM-dd"),
                _ => string.Empty
            });

            builder.AppendLine(string.Join(',', values.Select(CsvEscape)));
        }

        return (builder.ToString(), rows.Count);
    }

    private async Task<(string Content, int RowCount)> BuildMemberSummaryCsvAsync(
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

        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', columns.Select(CsvEscape)));

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

            builder.AppendLine(string.Join(',', values.Select(CsvEscape)));
        }

        return (builder.ToString(), rows.Count);
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

        // BR-47 — sau khi xoá, "liên kết trước đó" phải không truy cập lại được. Trả 404 chứ
        // không phải 403: người gọi không cần biết bản ghi từng tồn tại.
        if (export.IsDeleted)
        {
            throw new NotFoundException("report_not_found", "Không tìm thấy báo cáo.");
        }

        // BR-45 — kiểm ownership Ở API, không dựa vào việc UI giấu link.
        if (!actorIsCenterManager && export.RequestedByUserId != actorUserId)
        {
            throw new ForbiddenException("report_not_owned", "Báo cáo này không thuộc về bạn (BR-45).");
        }

        return export;
    }

    private async Task<ReportExportDto> GetOneAsync(Guid reportExportId, CancellationToken ct)
        => await db.Set<ReportExport>().AsNoTracking()
               .Where(r => r.ReportExportId == reportExportId).Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("report_not_found", "Không tìm thấy báo cáo.");

    // Quy tắc CSV (RFC 4180): bọc nháy kép khi có dấu phẩy/nháy/xuống dòng, và nhân đôi nháy bên trong.
    private static string CsvEscape(string? value)
    {
        value ??= string.Empty;

        return value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }

    private static System.Linq.Expressions.Expression<Func<ReportExport, ReportExportDto>> Projection()
        => r => new ReportExportDto(
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
            r.ExpiresAt);

    private sealed record ExportParameters(string FromDate, string ToDate, List<string> Columns);
}
