namespace SportHub.Administration.Domain.Enums;

/// <summary>
/// Vòng đời của một tệp xuất (BR-48). Enum MỚI, chưa có trong SSOT §3 — xem
/// implementation-decisions.md mục A4 (CẦN DUYỆT).
/// </summary>
public enum ReportExportStatus
{
    Pending,
    Completed,

    // BR-48: quá trình tạo bị gián đoạn thì ghi FAILED và cho người dùng thử lại,
    // chứ không xoá bản ghi đi như chưa có gì xảy ra.
    Failed
}
