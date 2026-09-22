using Microsoft.Extensions.Configuration;
using SportHub.Administration.Domain.Entities;

namespace SportHub.Administration.Infrastructure;

/// <summary>
/// Kho tệp báo cáo. Interface tách khỏi service để test không phải ghi ra đĩa thật, và để
/// đổi sang object storage sau này mà không đụng logic BR-44..BR-48.
/// </summary>
public interface IReportStorage
{
    Task WriteAsync(Guid reportExportId, string format, byte[] content, CancellationToken ct = default);

    Task<byte[]?> ReadAsync(Guid reportExportId, string format, CancellationToken ct = default);

    Task DeleteAsync(Guid reportExportId, string format, CancellationToken ct = default);
}

/// <summary>
/// Lưu tệp ra thư mục cấu hình <c>Reports:StorageRoot</c> (mặc định <c>App_Data/reports</c>).
///
/// Tên tệp LUÔN là {reportExportId}.csv, không bao giờ lấy theo chuỗi người dùng nhập —
/// tên do người dùng đặt là đường dẫn trực tiếp tới path traversal.
///
/// Nội dung để ngoài DB: báo cáo giữ 6 tháng (BR-46) và một cột bytea phình to sẽ kéo theo
/// mọi lần backup/restore của toàn bộ database.
/// </summary>
public sealed class FileSystemReportStorage : IReportStorage
{
    private readonly string _root;

    public FileSystemReportStorage(IConfiguration configuration)
    {
        var configured = configuration["Reports:StorageRoot"];

        _root = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(AppContext.BaseDirectory, "App_Data", "reports")
            : Path.GetFullPath(configured);

        Directory.CreateDirectory(_root);
    }

    public async Task WriteAsync(
        Guid reportExportId, string format, byte[] content, CancellationToken ct = default)
        => await File.WriteAllBytesAsync(PathFor(reportExportId, format), content, ct);

    public async Task<byte[]?> ReadAsync(Guid reportExportId, string format, CancellationToken ct = default)
    {
        var path = PathFor(reportExportId, format);

        // File có thể đã bị dọn ngoài ứng dụng (BR-46 chỉ yêu cầu giữ TỐI THIỂU 6 tháng).
        // Trả null để service báo lỗi có nghĩa thay vì ném IOException thô.
        return File.Exists(path) ? await File.ReadAllBytesAsync(path, ct) : null;
    }

    public Task DeleteAsync(Guid reportExportId, string format, CancellationToken ct = default)
    {
        var path = PathFor(reportExportId, format);

        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    // Guid.ToString("D") chỉ sinh chữ số hex và dấu gạch — không thể chứa ".." hay dấu phân cách đường dẫn.
    private string PathFor(Guid reportExportId, string format)
        => Path.Combine(_root, $"{reportExportId:D}.{ReportFormats.Extension(format)}");
}
