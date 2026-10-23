using System.Text.RegularExpressions;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Identity.Api;

/// <summary>Trường bắt buộc của yêu cầu PAYMENT (hoàn tiền về tài khoản). Dùng chung cho Member tự gửi và nhân viên tạo hộ.</summary>
public sealed record SupportPaymentFields(Guid InvoiceItemId, string BankName, string AccountNumber, string AccountHolder)
{
    public const string Category = "PAYMENT";

    private static readonly Regex AccountPattern = new(@"^[0-9]{6,20}$", RegexOptions.Compiled);

    /// <summary>Trả null khi category không phải PAYMENT (và không có trường nào được gửi lên); ngược lại ném 400 nếu thiếu/sai.</summary>
    public static SupportPaymentFields? Parse(string category, Guid? invoiceItemId, string? bankName,
        string? accountNumber, string? accountHolder, int evidenceCount)
    {
        var supplied = invoiceItemId is not null || !string.IsNullOrWhiteSpace(bankName)
            || !string.IsNullOrWhiteSpace(accountNumber) || !string.IsNullOrWhiteSpace(accountHolder);
        if (category != Category)
        {
            if (supplied)
                throw new BadRequestException("support_payment_fields_unexpected",
                    "Bank refund details can only be sent with a Payment request.");
            return null;
        }
        if (invoiceItemId is not Guid itemId || itemId == Guid.Empty)
            throw new BadRequestException("support_payment_item_required", "Choose the transaction you want refunded.");
        var bank = bankName?.Trim() ?? string.Empty;
        if (bank.Length is < 2 or > 100)
            throw new BadRequestException("support_payment_bank_required", "Enter the bank name (2-100 characters).");
        var number = new string((accountNumber ?? string.Empty).Where(c => !char.IsWhiteSpace(c) && c != '-').ToArray());
        if (!AccountPattern.IsMatch(number))
            throw new BadRequestException("support_payment_account_invalid", "The account number must contain 6 to 20 digits.");
        var holder = string.Join(' ', (accountHolder ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries));
        if (holder.Length is < 2 or > 120)
            throw new BadRequestException("support_payment_holder_required", "Enter the account holder name (2-120 characters).");
        if (evidenceCount < 1)
            throw new BadRequestException("support_payment_evidence_required",
                "Attach at least one image of the transaction as evidence.");
        return new SupportPaymentFields(itemId, bank, number, holder);
    }

    public BankRefundIntake ToIntake(Guid requestId, Guid memberId, Guid actorId)
        => new(requestId, memberId, actorId, InvoiceItemId, BankName, AccountNumber, AccountHolder);
}
