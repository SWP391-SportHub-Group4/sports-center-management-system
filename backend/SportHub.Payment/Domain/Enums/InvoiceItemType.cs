namespace SportHub.Payment.Domain.Enums;

public enum InvoiceItemType
{
    Membership,
    ReservedLegacyItem = 1, // giữ ordinal của dữ liệu cũ
    ClassPackage,
    Rental,
    ClassTransferDifference,
    WalletTopUp
}
