using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

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

    [Fact]
    public void Refund_khong_lam_giam_NetPayable()
    {
        var withoutRefund = Balance(3_000_000m, gross: 3_000_000m);
        var withRefund = Balance(3_000_000m, gross: 3_000_000m, refunded: 1_000_000m);

        Assert.Equal(withoutRefund.NetPayable, withRefund.NetPayable);
        Assert.Equal(3_000_000m, withRefund.NetPayable);

        Assert.Equal(2_000_000m, withRefund.NetCollected);
        Assert.Equal(1_000_000m, withRefund.Outstanding);
    }

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
    [InlineData(0, false)]
    [InlineData(-1000, false)]
    [InlineData(1_000_000, false)]
    [InlineData(3_000_000, true)]
    [InlineData(3_000_001, false)]
    public void CanAcceptPayment_chan_khoan_thu_vuot_Outstanding(decimal amount, bool expected)
    {
        var b = Balance(3_000_000m);

        Assert.Equal(expected, InvoiceMath.CanAcceptPayment(b, amount));
    }

    [Fact]
    public void CanAcceptPayment_ha_tran_theo_Discount_da_duyet()
    {
        var b = Balance(3_000_000m, gross: 1_000_000m, obligationReduction: 500_000m);

        Assert.True(InvoiceMath.CanAcceptPayment(b, 1_500_000m));
        Assert.False(InvoiceMath.CanAcceptPayment(b, 1_500_001m));
    }

    [Fact]
    public void MaxRefundable_bang_so_tien_thuc_dang_giu()
    {
        var b = Balance(3_000_000m, gross: 2_000_000m, refunded: 500_000m);

        Assert.Equal(1_500_000m, b.MaxRefundable);
        Assert.Equal(b.NetCollected, b.MaxRefundable);
    }

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
    [InlineData(3_000_000, InvoiceStatus.Paid)]
    public void DeriveStatus_theo_so_lieu(decimal collected, InvoiceStatus expected)
    {
        var b = Balance(3_000_000m, gross: collected);

        Assert.Equal(expected, InvoiceMath.DeriveStatus(InvoiceStatus.Issued, b));
    }

    [Fact]
    public void DeriveStatus_thanh_Paid_khi_Discount_ha_nghia_vu_bang_so_da_thu()
    {
        var b = Balance(3_000_000m, gross: 2_500_000m, obligationReduction: 500_000m);

        Assert.True(b.IsFullyPaid);
        Assert.Equal(InvoiceStatus.Paid, InvoiceMath.DeriveStatus(InvoiceStatus.Issued, b));
    }
}
