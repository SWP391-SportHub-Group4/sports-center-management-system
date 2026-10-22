namespace SportHub.Payment.Application.Interfaces;

public interface IInvoiceClassNameReader
{
    Task<IReadOnlyDictionary<int, string>> GetNamesAsync(
        IReadOnlyCollection<int> classIds, CancellationToken ct = default);
}
