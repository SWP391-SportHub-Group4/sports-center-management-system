using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace SportHub.Administration.Infrastructure;

/// <summary>Một bảng đã sẵn sàng để in — tiêu đề cột và các dòng, đều là chuỗi đã format.</summary>
/// <param name="Title">Tiêu đề báo cáo in ở đầu mỗi trang.</param>
/// <param name="Subtitle">Khoảng thời gian, người tạo, thời điểm tạo.</param>
/// <param name="Headers">Nhãn cột — đã lọc theo lựa chọn của Manager (BR-44).</param>
/// <param name="Rows">Dữ liệu; mỗi dòng có đúng <c>Headers.Count</c> ô.</param>
/// <param name="NumericColumns">Chỉ số cột canh phải (cột tiền/số).</param>
public sealed record ReportTable(
    string Title,
    string Subtitle,
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> Rows,
    IReadOnlySet<int> NumericColumns);

public interface IReportPdfRenderer
{
    byte[] Render(ReportTable table);
}

/// <summary>
/// Sinh PDF cho BR-48 bằng QuestPDF.
///
/// Về tiếng Việt: dùng Lato, font QuestPDF nhúng sẵn, có đủ glyph Latin Extended Additional
/// (các dấu tiếng Việt như ế, ộ, ữ nằm ở dải này). Cố tình KHÔNG dựa vào font hệ điều hành:
/// máy deploy Linux container thường không có Arial, và khi thiếu glyph thì chữ ra ô vuông
/// hoặc mất dấu mà không có exception nào báo.
/// Kiểm chứng bằng cách trích lại text từ file PDF đã sinh, không chỉ nhìn bằng mắt.
///
/// Về phân trang: dùng <c>Table</c> của QuestPDF với header lặp lại, nên bảng dài tự tràn
/// sang trang mới và mỗi trang đều có dòng tiêu đề — yêu cầu "không tràn bảng" của plan §6.3.
/// </summary>
public sealed class ReportPdfRenderer : IReportPdfRenderer
{
    /// <summary>
    /// QuestPDF Community — miễn phí cho tổ chức nhỏ và mục đích học tập. Đặt một lần ở đây
    /// thay vì ở Program.cs để thư viện không bị dùng khi chưa khai báo giấy phép.
    /// </summary>
    static ReportPdfRenderer() => QuestPDF.Settings.License = LicenseType.Community;

    public byte[] Render(ReportTable table)
    {
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                // Bảng nhiều cột tiền đọc dễ hơn ở khổ ngang; báo cáo doanh thu hiện có tới
                // 14 cột được phép chọn.
                page.Size(PageSizes.A4.Landscape());
                page.Margin(24);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Lato"));

                page.Header().Column(column =>
                {
                    column.Item().Text(table.Title).FontSize(15).SemiBold();
                    column.Item().Text(table.Subtitle).FontSize(8).FontColor(Colors.Grey.Darken1);
                    column.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                });

                page.Content().PaddingVertical(8).Table(grid =>
                {
                    grid.ColumnsDefinition(definition =>
                    {
                        foreach (var _ in table.Headers)
                        {
                            definition.RelativeColumn();
                        }
                    });

                    // Header lặp lại trên MỌI trang — bảng 20 trang mà chỉ trang đầu có tiêu
                    // đề cột thì 19 trang còn lại không đọc được.
                    grid.Header(header =>
                    {
                        for (var i = 0; i < table.Headers.Count; i++)
                        {
                            var cell = header.Cell()
                                .Background(Colors.Grey.Lighten3)
                                .Padding(4)
                                .Text(table.Headers[i])
                                .SemiBold()
                                .FontSize(8);

                            if (table.NumericColumns.Contains(i))
                            {
                                cell.AlignRight();
                            }
                        }
                    });

                    foreach (var row in table.Rows)
                    {
                        for (var i = 0; i < table.Headers.Count; i++)
                        {
                            var value = i < row.Count ? row[i] : string.Empty;

                            var cell = grid.Cell()
                                .BorderBottom(0.5f)
                                .BorderColor(Colors.Grey.Lighten2)
                                .Padding(4)
                                .Text(value)
                                .FontSize(8);

                            if (table.NumericColumns.Contains(i))
                            {
                                cell.AlignRight();
                            }
                        }
                    }
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.DefaultTextStyle(x => x.FontSize(8).FontColor(Colors.Grey.Darken1));
                    text.Span("Trang ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });
        }).GeneratePdf();
    }
}
