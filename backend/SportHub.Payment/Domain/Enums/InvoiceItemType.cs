namespace SportHub.Payment.Domain.Enums;

public enum InvoiceItemType
{
    Membership,
    PT, // ngừng dùng; giữ để không đổi số lưu của các loại sau
    ClassPackage,
    Rental,
    ClassTransferDifference
}
