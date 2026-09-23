using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Payment.Infrastructure;

public interface IInvoiceNumberGenerator
{
    Task<string> NextAsync(DateTime issuedAtUtc, CancellationToken ct = default);
}

/// <summary>
/// BR-58 — InvoiceNumber duy nhất toàn hệ thống, dễ đọc, sinh từ DB sequence.
///
/// nextval() là nguyên tử và KHÔNG bị rollback: hai request đồng thời luôn nhận hai số khác
/// nhau kể cả khi một trong hai transaction sau đó rollback (chỉ để thủng một số trong dãy,
/// không trùng). Đó là lý do BR-58 cấm sinh ngẫu nhiên ở tầng ứng dụng — random/Guid không
/// có bảo đảm đó khi hai bên cùng kiểm tra trùng rồi cùng ghi.
///
/// Tiền tố năm chỉ để dễ đọc; tính duy nhất nằm hoàn toàn ở sequence, và sequence KHÔNG reset
/// theo năm (reset sẽ sinh lại số cũ với tiền tố mới, làm số hoá đơn không còn tăng đơn điệu).
/// </summary>
public sealed class InvoiceNumberGenerator(ISportHubDbContext db) : IInvoiceNumberGenerator
{
    public const string SequenceName = "invoice_number_seq";

    public async Task<string> NextAsync(DateTime issuedAtUtc, CancellationToken ct = default)
    {
        var next = await db.Database
            .SqlQueryRaw<long>($"SELECT nextval('{SequenceName}') AS \"Value\"")
            .SingleAsync(ct);

        return $"INV-{issuedAtUtc:yyyy}-{next:D6}";
    }
}
