using SportHub.Identity.Domain.Entities;

namespace SportHub.Administration.Domain.Entities;

/// <summary>
/// Metadata của một tệp báo cáo đã tạo (BR-44 → BR-48).
///
/// Entity MỚI, chưa có trong SSOT §2 — xem implementation-decisions.md mục A4 (CẦN DUYỆT).
/// Tải CSV tức thì (Content-Disposition) KHÔNG đáp ứng được nhóm BR này: không có bản ghi
/// nào để phân quyền theo người tạo (BR-45), giữ 6 tháng (BR-46), xoá cho link cũ hết hiệu
/// lực (BR-47), hay đánh dấu FAILED và tạo lại (BR-48).
///
/// Nội dung file nằm NGOÀI DB, dưới thư mục cấu hình Reports:StorageRoot; tên file luôn là
/// {ReportExportId}.csv chứ không lấy theo chuỗi người dùng nhập.
/// </summary>
public class ReportExport
{
    public Guid ReportExportId { get; set; } // PK, đồng thời là tên file trên đĩa

    /// <summary>Chuỗi tự do như AuditLog.Action (vd REVENUE, MEMBER_SUMMARY) — xem ReportTypes.</summary>
    public string ReportType { get; set; } = string.Empty;

    public Guid RequestedByUserId { get; set; } // FK -> UserAccount; cơ sở phân quyền BR-45

    public UserAccount? RequestedByUser { get; set; }

    /// <summary>
    /// JSON gồm khoảng thời gian và DANH SÁCH CỘT người dùng chọn. Cột được chọn phải lưu lại
    /// thì BR-44 mới kiểm chứng được sau khi file đã sinh xong.
    /// </summary>
    public string ParametersJson { get; set; } = "{}";

    /// <summary>
    /// Định dạng tệp. String whitelist Csv/Pdf theo SSOT §5.7 — cố tình KHÔNG phải enum để
    /// thêm định dạng sau này không phải migrate kiểu cột. Giá trị hợp lệ: <see cref="ReportFormats"/>.
    /// </summary>
    public string Format { get; set; } = ReportFormats.Csv;

    public ReportExportStatus Status { get; set; }

    public int RowCount { get; set; }

    public long SizeBytes { get; set; }

    public string? FailureReason { get; set; } // chỉ có giá trị khi Status = Failed (BR-48)

    public DateTime CreatedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    /// <summary>
    /// BR-46 v1.4 — <b>CompletedAt</b> + 6 tháng, không phải CreatedAt: quy tắc nói "kể từ thời
    /// điểm hoàn tất". Bản ghi chưa Completed chưa có mốc giữ file nào vì chưa có file.
    /// Không có job nào xoá trước mốc này.
    /// </summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// BR-47 — soft delete. Xoá cứng sẽ mất luôn dấu vết "đã từng có báo cáo này", trong khi
    /// BR chỉ yêu cầu link cũ không truy cập lại được.
    /// </summary>
    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }
}

/// <summary>Các loại báo cáo được hỗ trợ và whitelist cột tương ứng (BR-44).</summary>
public static class ReportTypes
{
    public const string Revenue = "REVENUE";

    public const string MemberSummary = "MEMBER_SUMMARY";

    /// <summary>
    /// Cột hợp lệ cho từng loại. Client chỉ được chọn TRONG danh sách này — cột lạ bị từ chối
    /// thay vì bỏ qua im lặng, để không sinh ra file thiếu cột mà người dùng tưởng là đủ.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> AllowedColumns =
        new Dictionary<string, IReadOnlyList<string>>
        {
            [Revenue] =
            [
                // BR-41 v1.4 — "adjustmentAmount"/"netAmount" cũ gộp giảm nghĩa vụ với tiền hoàn
                // thành một số vô nghĩa; thay bằng các đại lượng tách bạch của InvoiceBalance.
                "invoiceNumber", "issuedAt", "memberEmail", "memberName", "totalAmount",
                "collectedAmount", "obligationReduction", "refundedAmount", "netCollected",
                "netPayable", "outstanding", "refundDue", "status", "dueDate"
            ],
            [MemberSummary] =
            [
                "email", "fullName", "phone", "status", "joinedAt",
                "activePackages", "remainingSessions", "totalSpent"
            ]
        };

    public static bool IsKnown(string reportType) => AllowedColumns.ContainsKey(reportType);
}

/// <summary>
/// Định dạng tệp xuất được phép (SSOT §5.7 — string whitelist, không thêm enum mới).
///
/// BR-48: PDF thuộc scope BẮT BUỘC và CSV không thay thế PDF.
/// </summary>
public static class ReportFormats
{
    public const string Csv = "Csv";

    public const string Pdf = "Pdf";

    public static readonly IReadOnlyList<string> All = [Csv, Pdf];

    /// <summary>Chuẩn hoá chuỗi client gửi; trả null nếu không nằm trong whitelist.</summary>
    public static string? Normalize(string? value)
        => All.FirstOrDefault(f => string.Equals(f, value?.Trim(), StringComparison.OrdinalIgnoreCase));

    public static string Extension(string format)
        => string.Equals(format, Pdf, StringComparison.OrdinalIgnoreCase) ? "pdf" : "csv";

    public static string ContentType(string format)
        => string.Equals(format, Pdf, StringComparison.OrdinalIgnoreCase) ? "application/pdf" : "text/csv";
}
