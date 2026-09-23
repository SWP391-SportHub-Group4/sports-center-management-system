using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

/// <summary>
/// BR-41 v1.4 — công thức đối soát. Đây là các test chạy được không cần DB, nên chúng là
/// tuyến phòng thủ đầu tiên cho đúng phần mà bản v1.3 làm sai: gộp Refund với
/// Discount/Correction vào một tổng duy nhất.
///
/// Ví dụ số lấy từ plan §4.3 và biên bản quyết định.
/// </summary>
public class InvoiceBalanceTests
{
    private static InvoiceBalance Balance(
        decimal total, decimal gross = 0m, decimal obligationReduction = 0m, decimal refunded = 0m)
        => new(total, gross, obligationReduction, refunded);

    [Fact]
    public void Hoa_don_moi_phat_hanh_Outstanding_bang_tong_tien()
    {
        var b = Balance(3_000_000m);

        Assert.Equal(3_000_000m, b.NetPayable);
        Assert.Equal(0m, b.NetCollected);
        Assert.Equal(3_000_000m, b.Outstanding);
        Assert.Equal(0m, b.RefundDue);
        Assert.False(b.IsFullyPaid);
    }

    /// <summary>
    /// Kịch bản chính của plan §4.3: hóa đơn 3 triệu thu đủ, rồi Discount 500 nghìn Completed.
    /// Kết quả phải là CẦN hoàn 500 nghìn, và ĐÃ hoàn vẫn bằng 0.
    /// Bản v1.3 gộp hai con số này làm một nên không diễn tả được trạng thái này.
    /// </summary>
    [Fact]
    public void Thu_du_roi_Discount_thi_RefundDue_tang_nhung_RefundedAmount_van_0()
    {
        var b = Balance(3_000_000m, gross: 3_000_000m, obligationReduction: 500_000m);

        Assert.Equal(2_500_000m, b.NetPayable);
        Assert.Equal(3_000_000m, b.NetCollected);
        Assert.Equal(0m, b.Outstanding);
        Assert.Equal(500_000m, b.RefundDue);
        Assert.Equal(0m, b.RefundedAmount);
    }

    /// <summary>Sau khi Lễ tân xác nhận thực trả: RefundedAmount lên 500k, RefundDue về 0.</summary>
    [Fact]
    public void Sau_khi_thuc_tra_thi_RefundedAmount_tang_va_RefundDue_ve_0()
    {
        var b = Balance(3_000_000m, gross: 3_000_000m, obligationReduction: 500_000m, refunded: 500_000m);

        Assert.Equal(2_500_000m, b.NetPayable);
        Assert.Equal(2_500_000m, b.NetCollected);
        Assert.Equal(0m, b.Outstanding);
        Assert.Equal(0m, b.RefundDue);
        Assert.Equal(500_000m, b.RefundedAmount);
        Assert.True(b.IsFullyPaid);
    }

    /// <summary>
    /// Kịch bản thứ hai của plan §4.3: thu cọc 1 triệu trên hóa đơn 3 triệu, rồi Discount
    /// 500 nghìn. Outstanding phải là 1,5 triệu và KHÔNG được sinh ra tiền hoàn giả.
    /// </summary>
    [Fact]
    public void Coc_mot_phan_cong_Discount_khong_sinh_tien_hoan_gia()
    {
        var b = Balance(3_000_000m, gross: 1_000_000m, obligationReduction: 500_000m);

        Assert.Equal(2_500_000m, b.NetPayable);
        Assert.Equal(1_000_000m, b.NetCollected);
        Assert.Equal(1_500_000m, b.Outstanding);
        Assert.Equal(0m, b.RefundDue);
        Assert.Equal(0m, b.RefundedAmount);
    }

    /// <summary>BR-41 — Refund KHÔNG làm giảm nghĩa vụ; hội viên không bớt nợ vì được hoàn tiền.</summary>
    [Fact]
    public void Refund_khong_lam_giam_NetPayable()
    {
        var withoutRefund = Balance(3_000_000m, gross: 3_000_000m);
        var withRefund = Balance(3_000_000m, gross: 3_000_000m, refunded: 1_000_000m);

        Assert.Equal(withoutRefund.NetPayable, withRefund.NetPayable);
        Assert.Equal(3_000_000m, withRefund.NetPayable);

        // Hoàn tiền trên hóa đơn chưa có căn cứ giảm nghĩa vụ làm phát sinh công nợ trở lại.
        Assert.Equal(2_000_000m, withRefund.NetCollected);
        Assert.Equal(1_000_000m, withRefund.Outstanding);
    }

    /// <summary>
    /// Chống tính giảm trừ HAI LẦN: một khoản 500k vừa được Discount vừa được hoàn lại bằng
    /// tiền thì nghĩa vụ chỉ giảm một lần, và số tiền đang giữ giảm đúng một lần.
    /// </summary>
    [Fact]
    public void Khong_giam_tru_hai_lan_cho_cung_mot_khoan()
    {
        var b = Balance(3_000_000m, gross: 3_000_000m, obligationReduction: 500_000m, refunded: 500_000m);

        Assert.Equal(2_500_000m, b.NetPayable);
        Assert.Equal(2_500_000m, b.NetCollected);
        Assert.Equal(0m, b.Outstanding);
        Assert.Equal(0m, b.RefundDue);
    }

    [Fact]
    public void Cac_dai_luong_khong_bao_gio_am()
    {
        var overReduced = Balance(1_000_000m, obligationReduction: 5_000_000m);
        var overRefunded = Balance(1_000_000m, gross: 1_000_000m, refunded: 5_000_000m);

        Assert.Equal(0m, overReduced.NetPayable);
        Assert.Equal(0m, overRefunded.NetCollected);
        Assert.True(overReduced.Outstanding >= 0m);
        Assert.True(overRefunded.RefundDue >= 0m);
    }

    [Theory]
    [InlineData(0, false)]      // BR-41: khoản thu phải DƯƠNG
    [InlineData(-1000, false)]
    [InlineData(1_000_000, true)]
    [InlineData(3_000_000, true)]   // đúng bằng Outstanding
    [InlineData(3_000_001, false)]  // vượt Outstanding 1 đồng
    public void CanAcceptPayment_chan_khoan_thu_vuot_Outstanding(decimal amount, bool expected)
    {
        var b = Balance(3_000_000m);

        Assert.Equal(expected, InvoiceMath.CanAcceptPayment(b, amount));
    }

    /// <summary>Sau Discount, trần thu mới là NetPayable chứ không còn là TotalAmount.</summary>
    [Fact]
    public void CanAcceptPayment_ha_tran_theo_Discount_da_duyet()
    {
        var b = Balance(3_000_000m, gross: 1_000_000m, obligationReduction: 500_000m);

        Assert.True(InvoiceMath.CanAcceptPayment(b, 1_500_000m));
        Assert.False(InvoiceMath.CanAcceptPayment(b, 1_500_001m));
    }

    /// <summary>
    /// MaxRefundable là trần TUYỆT ĐỐI của một khoản hoàn: không hoàn quá số tiền thực tế
    /// còn đang giữ, kể cả khi RefundDue lớn hơn vì lý do nào đó.
    /// </summary>
    [Fact]
    public void MaxRefundable_bang_so_tien_thuc_dang_giu()
    {
        var b = Balance(3_000_000m, gross: 2_000_000m, refunded: 500_000m);

        Assert.Equal(1_500_000m, b.MaxRefundable);
        Assert.Equal(b.NetCollected, b.MaxRefundable);
    }

    /// <summary>
    /// BR-40 — Paid là dữ kiện lịch sử: một khoản hoàn KHÔNG kéo hóa đơn ngược về
    /// PartiallyPaid. Số dư thực tế đọc ở InvoiceBalance, không đọc ở Status.
    /// </summary>
    [Fact]
    public void DeriveStatus_giu_Paid_khi_da_hoan_tien()
    {
        var afterRefund = Balance(3_000_000m, gross: 3_000_000m, refunded: 1_000_000m);

        Assert.Equal(InvoiceStatus.Paid, InvoiceMath.DeriveStatus(InvoiceStatus.Paid, afterRefund));
    }

    [Fact]
    public void DeriveStatus_giu_Void_bat_ke_so_lieu()
    {
        Assert.Equal(
            InvoiceStatus.Void,
            InvoiceMath.DeriveStatus(InvoiceStatus.Void, Balance(3_000_000m, gross: 3_000_000m)));
    }

    [Theory]
    [InlineData(0, InvoiceStatus.Issued)]
    [InlineData(1_000_000, InvoiceStatus.PartiallyPaid)]
    [InlineData(3_000_000, InvoiceStatus.Paid)]
    public void DeriveStatus_theo_so_lieu(decimal collected, InvoiceStatus expected)
    {
        var b = Balance(3_000_000m, gross: collected);

        Assert.Equal(expected, InvoiceMath.DeriveStatus(InvoiceStatus.Issued, b));
    }

    /// <summary>Discount kéo nghĩa vụ xuống bằng số đã thu ⇒ hóa đơn thành Paid (BR-30 kích hoạt gói).</summary>
    [Fact]
    public void DeriveStatus_thanh_Paid_khi_Discount_ha_nghia_vu_bang_so_da_thu()
    {
        var b = Balance(3_000_000m, gross: 2_500_000m, obligationReduction: 500_000m);

        Assert.True(b.IsFullyPaid);
        Assert.Equal(InvoiceStatus.Paid, InvoiceMath.DeriveStatus(InvoiceStatus.PartiallyPaid, b));
    }

    /// <summary>BR-55 — hạn tính theo THÁNG LỊCH, không phải 60/360 ngày.</summary>
    [Fact]
    public void InitialDueDate_cong_hai_thang_lich()
    {
        Assert.Equal(
            new DateTime(2026, 3, 15, 10, 0, 0, DateTimeKind.Utc),
            InvoiceMath.InitialDueDate(new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc)));
    }

    /// <summary>
    /// Ca biên cuối tháng: 31/12 + 2 tháng phải kẹp về 28/02 (2027 không nhuận), không tràn
    /// sang tháng 3. AddMonths của .NET làm đúng việc này — test để khóa hành vi lại.
    /// </summary>
    [Fact]
    public void InitialDueDate_kep_ngay_cuoi_thang()
    {
        Assert.Equal(
            new DateTime(2027, 2, 28, 0, 0, 0, DateTimeKind.Utc),
            InvoiceMath.InitialDueDate(new DateTime(2026, 12, 31, 0, 0, 0, DateTimeKind.Utc)));
    }

    /// <summary>Năm nhuận: 31/12/2027 + 2 tháng = 29/02/2028.</summary>
    [Fact]
    public void InitialDueDate_nam_nhuan()
    {
        Assert.Equal(
            new DateTime(2028, 2, 29, 0, 0, 0, DateTimeKind.Utc),
            InvoiceMath.InitialDueDate(new DateTime(2027, 12, 31, 0, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void DueDateAfterFirstDeposit_cong_12_thang_lich()
    {
        Assert.Equal(
            new DateTime(2027, 2, 28, 0, 0, 0, DateTimeKind.Utc),
            InvoiceMath.DueDateAfterFirstDeposit(new DateTime(2026, 2, 28, 0, 0, 0, DateTimeKind.Utc)));
    }

    /// <summary>29/02 năm nhuận + 12 tháng phải về 28/02 năm thường, không nhảy sang 01/03.</summary>
    [Fact]
    public void DueDateAfterFirstDeposit_tu_ngay_29_02_nam_nhuan()
    {
        Assert.Equal(
            new DateTime(2029, 2, 28, 0, 0, 0, DateTimeKind.Utc),
            InvoiceMath.DueDateAfterFirstDeposit(new DateTime(2028, 2, 29, 0, 0, 0, DateTimeKind.Utc)));
    }
}
