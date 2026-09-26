namespace SportHub.Payment.Domain.Rules;

public readonly record struct InvoiceBalance(
    decimal TotalAmount,
    decimal GrossCollected,
    decimal ObligationReduction,
    decimal RefundedAmount)
{
    public decimal NetPayable => Math.Max(0m, TotalAmount - ObligationReduction);

    public decimal NetCollected => Math.Max(0m, GrossCollected - RefundedAmount);

    public decimal Outstanding => Math.Max(0m, NetPayable - NetCollected);

    public decimal RefundDue => Math.Max(0m, NetCollected - NetPayable);

    public decimal MaxRefundable => NetCollected;

    public bool IsFullyPaid => NetCollected >= NetPayable;
}

public static class InvoiceMath
{
    public static InvoiceStatus DeriveStatus(InvoiceStatus current, InvoiceBalance balance)
    {
        if (current is InvoiceStatus.Void or InvoiceStatus.Paid)
        {
            return current;
        }

        return balance.IsFullyPaid ? InvoiceStatus.Paid : InvoiceStatus.Issued;
    }

    public static bool CanAcceptPayment(InvoiceBalance balance, decimal amount)
        => amount > 0m && amount == balance.Outstanding;
}
