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

    public ReportExportStatus Status { get; set; }

    public int RowCount { get; set; }

    public long SizeBytes { get; set; }

    public string? FailureReason { get; set; } // chỉ có giá trị khi Status = Failed (BR-48)

    public DateTime CreatedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    /// <summary>BR-46 — CreatedAt + 6 tháng. Không có job nào xoá trước mốc này.</summary>
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
                "invoiceNumber", "issuedAt", "memberEmail", "memberName", "totalAmount",
                "collectedAmount", "adjustmentAmount", "netAmount", "status", "dueDate"
            ],
            [MemberSummary] =
            [
                "email", "fullName", "phone", "status", "joinedAt",
                "activePackages", "remainingSessions", "totalSpent"
            ]
        };

    public static bool IsKnown(string reportType) => AllowedColumns.ContainsKey(reportType);
}
