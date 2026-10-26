using SportHub.Scheduling.Rental.Application;

namespace SportHub.Payment.Tests.Integration;

internal static class IncidentTestRequests
{
    public static async Task<IncidentRequest> ReviewAsync(IncidentService service, IncidentRequest request)
    {
        var preview = await service.PreviewAsync(request);
        return request with { PreviewToken = preview.PreviewToken, OperationId = Guid.NewGuid(),
            Refunds = preview.Refunds.Select(r => new IncidentRefundSelection(r.SourceId, r.SuggestedRefundPoints)).ToList() };
    }
}
