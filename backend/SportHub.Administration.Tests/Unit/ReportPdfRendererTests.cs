using SportHub.Administration.Domain.Entities;
using SportHub.Administration.Infrastructure;
using System.Diagnostics;
using System.Globalization;
using UglyToad.PdfPig;

namespace SportHub.Administration.Tests.Unit;

/// <summary>
/// BR-48 — PDF là định dạng bắt buộc, CSV không thay thế.
///
/// Các test này KHÔNG chỉ kiểm "hàm chạy không ném lỗi": chúng sinh file PDF thật rồi
/// TRÍCH NGƯỢC text ra bằng PdfPig và so sánh. Đó là cách duy nhất chứng minh dấu tiếng
/// Việt thực sự render được — một font thiếu glyph vẫn sinh ra PDF hợp lệ, chỉ là chữ biến
/// thành ô trống hoặc mất dấu, và không có exception nào báo cho biết.
/// </summary>
public class ReportPdfRendererTests
{
    private static readonly string[] RevenueColumns =
    [
        "invoiceNumber", "issuedAt", "memberName", "totalAmount",
        "collectedAmount", "obligationReduction", "refundedAmount",
        "netCollected", "outstanding", "refundDue", "status"
    ];

    private static ReportTable BuildTable(int rowCount, string memberName = "Nguyễn Thị Mỹ Duyên")
    {
        var headers = RevenueColumns.Select(ReportColumnLabels.For).ToList();

        var numeric = RevenueColumns
            .Select((c, i) => (c, i))
            .Where(x => ReportColumnLabels.IsNumeric(x.c))
            .Select(x => x.i)
            .ToHashSet();

        var rows = Enumerable.Range(1, rowCount)
            .Select(i => (IReadOnlyList<string>)
            [
                $"INV-{i:D6}",
                "2026-09-22",
                memberName,
                "3000000", "3000000", "500000", "0",
                "3000000", "0", "500000",
                "Paid"
            ])
            .ToList();

        return new ReportTable(
            ReportColumnLabels.ReportTitle(ReportTypes.Revenue),
            "Kỳ 01/09/2026 – 30/09/2026 · Xuất lúc 10:30 22/09/2026 (giờ Việt Nam)",
            headers,
            rows,
            numeric);
    }

    private static string ExtractText(byte[] pdfBytes)
    {
        using var document = PdfDocument.Open(pdfBytes);

        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }

    [Fact]
    public void Sinh_ra_file_PDF_hop_le()
    {
        var bytes = new ReportPdfRenderer().Render(BuildTable(5));

        Assert.True(bytes.Length > 0);

        // Chữ ký %PDF- ở đầu file.
        Assert.Equal("%PDF-"u8.ToArray(), bytes.Take(5).ToArray());

        using var document = PdfDocument.Open(bytes);
        Assert.True(document.NumberOfPages >= 1);
    }

    /// <summary>
    /// Yêu cầu cốt lõi của plan §6.3: "PDF tiếng Việt đọc được". Kiểm bằng cách trích text
    /// ra và so đúng chuỗi có dấu, không chỉ nhìn file.
    ///
    /// Chỉ so các nhãn NGẮN: cột hẹp trong bảng 11 cột khiến QuestPDF tự xuống dòng giữa
    /// chuỗi dài, và khi đó text trích ra bị ngắt quãng — đó là hành vi layout đúng, không
    /// phải lỗi font. Chuỗi dài được kiểm riêng ở test dưới với bảng ít cột.
    /// </summary>
    [Theory]
    [InlineData("Báo cáo doanh thu")]
    [InlineData("Số hóa đơn")]
    [InlineData("Đã thu")]
    [InlineData("Đã hoàn")]
    [InlineData("Thực thu")]
    [InlineData("Cần hoàn")]
    [InlineData("Trạng thái")]
    [InlineData("giờ Việt Nam")]
    public void Chu_tieng_Viet_co_dau_trich_nguoc_ra_dung(string expected)
    {
        var text = ExtractText(new ReportPdfRenderer().Render(BuildTable(3)));

        Assert.Contains(expected, text);
    }

    /// <summary>
    /// Bẫy điển hình khi font thiếu glyph: file PDF vẫn hợp lệ, không có exception nào, nhưng
    /// chữ ra ô trống hoặc mất dấu. Dùng bảng 2 cột rộng để loại hẳn yếu tố xuống dòng, rồi
    /// khẳng định từng ký tự tiếng Việt khó nhất đều có mặt trong text trích ngược.
    /// </summary>
    [Fact]
    public void Khong_bi_mat_dau_tieng_Viet()
    {
        const string sample = "Nguyễn Thị Mỹ Duyên";
        const string sample2 = "Đỗ Quỳnh Hương";

        var table = new ReportTable(
            "Báo cáo doanh thu",
            "Dấu đầy đủ: ế ộ ữ ỹ Đ ợ ằ ễ ị ạ ẩ ừ",
            ["Số hóa đơn", "Tên hội viên"],
            [["INV-000001", sample], ["INV-000002", sample2]],
            new HashSet<int>());

        var text = ExtractText(new ReportPdfRenderer().Render(table));

        // Chuỗi dài nguyên vẹn khi cột đủ rộng.
        Assert.Contains(sample, text);
        Assert.Contains(sample2, text);

        foreach (var ch in "ếộữỹĐợằễịạẩừ")
        {
            Assert.True(
                text.Contains(ch),
                $"Ký tự '{ch}' (U+{(int)ch:X4}) không xuất hiện trong text trích từ PDF — "
                + "font thiếu glyph hoặc mất dấu.");
        }
    }

    /// <summary>Bảng dài phải tràn sang nhiều trang thay vì bị cắt mất ở trang một.</summary>
    [Fact]
    public void Bang_dai_tu_phan_trang()
    {
        using var document = PdfDocument.Open(new ReportPdfRenderer().Render(BuildTable(400)));

        Assert.True(
            document.NumberOfPages > 1,
            $"400 dòng chỉ ra {document.NumberOfPages} trang — nhiều khả năng bảng bị cắt.");
    }

    /// <summary>Tiêu đề cột phải lặp lại trên MỌI trang, không chỉ trang đầu.</summary>
    [Fact]
    public void Tieu_de_cot_lap_lai_tren_moi_trang()
    {
        using var document = PdfDocument.Open(new ReportPdfRenderer().Render(BuildTable(400)));

        Assert.True(document.NumberOfPages > 1);

        foreach (var page in document.GetPages())
        {
            Assert.Contains("Số hóa đơn", page.Text);
        }
    }

    /// <summary>Mỗi trang có số trang để bản in nhiều tờ không bị lẫn thứ tự.</summary>
    [Fact]
    public void Moi_trang_co_so_trang()
    {
        using var document = PdfDocument.Open(new ReportPdfRenderer().Render(BuildTable(400)));

        foreach (var page in document.GetPages())
        {
            Assert.Contains("Trang", page.Text);
        }
    }

    /// <summary>
    /// BR-44 — file chỉ chứa cột đã chọn. Bỏ cột "Cần hoàn" ra khỏi lựa chọn thì nhãn đó
    /// không được xuất hiện ở đâu trong PDF.
    /// </summary>
    [Fact]
    public void Chi_in_cot_da_chon()
    {
        var chosen = new[] { "invoiceNumber", "memberName", "totalAmount" };

        var table = new ReportTable(
            "Báo cáo doanh thu",
            "Kỳ thử nghiệm",
            [.. chosen.Select(ReportColumnLabels.For)],
            [["INV-000001", "Trần Văn Bảo", "1000000"]],
            chosen.Select((c, i) => (c, i)).Where(x => ReportColumnLabels.IsNumeric(x.c))
                .Select(x => x.i).ToHashSet());

        var text = ExtractText(new ReportPdfRenderer().Render(table));

        Assert.Contains("Số hóa đơn", text);
        Assert.DoesNotContain("Cần hoàn", text);
        Assert.DoesNotContain("Giảm nghĩa vụ", text);
    }

    /// <summary>
    /// BR-48 — "PDF tối đa 20 trang phải được tạo trong vòng 15 giây với điều kiện đo được
    /// ghi rõ". Điều kiện đo: chỉ tính thời gian RENDER (dữ liệu đã có sẵn trong bộ nhớ),
    /// khổ A4 ngang, 11 cột, ~34 dòng/trang. Không bao gồm thời gian truy vấn DB.
    ///
    /// Ngưỡng test đặt ở 15 giây đúng theo BR; số đo thực tế in ra để ghi vào
    /// implementation-status.md.
    /// </summary>
    [Fact]
    public void PDF_20_trang_sinh_duoi_15_giay()
    {
        var renderer = new ReportPdfRenderer();

        // Làm nóng: lần gọi đầu gánh chi phí nạp font và khởi tạo engine, không đại diện
        // cho chi phí sinh báo cáo thường xuyên.
        renderer.Render(BuildTable(5));

        var table = BuildTable(700);

        var stopwatch = Stopwatch.StartNew();
        var bytes = renderer.Render(table);
        stopwatch.Stop();

        using var document = PdfDocument.Open(bytes);

        Assert.True(
            document.NumberOfPages >= 20,
            $"Bộ dữ liệu chỉ sinh {document.NumberOfPages} trang, chưa đủ để kiểm ngưỡng 20 trang.");

        Assert.True(
            stopwatch.Elapsed.TotalSeconds < 15,
            $"Sinh {document.NumberOfPages} trang mất {stopwatch.Elapsed.TotalSeconds:F2}s, vượt ngưỡng 15s (BR-48).");

        Console.WriteLine(
            $"[BR-48] {document.NumberOfPages} trang / {table.Rows.Count} dòng / {table.Headers.Count} cột "
            + $"→ {stopwatch.Elapsed.TotalMilliseconds.ToString("F0", CultureInfo.InvariantCulture)} ms, "
            + $"{bytes.Length / 1024} KB");
    }
}
