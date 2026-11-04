namespace SportHub.BuildingBlocks.Abstractions.Reporting;

/// <summary>Composable payment evidence for operational reports, including point-only payments.</summary>
public interface IPaidInvoiceReportReader
{
    IQueryable<Guid> PaidInvoiceIds { get; }
    IQueryable<Guid> PaidInvoiceItemIds { get; }
}
