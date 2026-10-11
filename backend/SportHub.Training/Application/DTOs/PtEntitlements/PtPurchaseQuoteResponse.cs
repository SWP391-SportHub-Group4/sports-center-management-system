namespace SportHub.Training.Application.DTOs.PtEntitlements;

public sealed record PtPurchaseQuoteResponse(Guid MemberPackageId, Guid CoachId,
    int FrequencyPerWeek, int TotalQuota, decimal PricePerSession, decimal TotalPrice,
    string PriceVersion, DateOnly ValidityEndDate);
