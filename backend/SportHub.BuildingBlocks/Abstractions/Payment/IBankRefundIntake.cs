namespace SportHub.BuildingBlocks.Abstractions.Payment;

/// <summary>
/// Cầu nối Support Request (Identity) sang quy trình hoàn tiền về ngân hàng (Payment). Identity tạo ticket PAYMENT
/// rồi gọi <see cref="AttachAsync"/> trong cùng DbContext: Payment kiểm tra quyền sở hữu giao dịch, tính snapshot và số
/// tiền gợi ý ở server, rồi thêm bản ghi hoàn tiền vào cùng unit of work. Caller chịu trách nhiệm SaveChanges.
/// </summary>
public interface IBankRefundIntake
{
    Task AttachAsync(BankRefundIntake intake, CancellationToken cancellationToken = default);
}

/// <param name="MemberId">Chủ ticket và chủ giao dịch; ticket do nhân viên tạo hộ vẫn phải khớp Member này.</param>
/// <param name="ActorUserId">Người tạo ticket (Member, Lễ tân hoặc Manager).</param>
public sealed record BankRefundIntake(
    Guid SupportRequestId,
    Guid MemberId,
    Guid ActorUserId,
    Guid InvoiceItemId,
    string BankName,
    string AccountNumber,
    string AccountHolder);
