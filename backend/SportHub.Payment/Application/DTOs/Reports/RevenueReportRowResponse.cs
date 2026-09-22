namespace SportHub.Payment.Application.DTOs;

public sealed record RevenueReportRowResponse(DateOnly Date, decimal Collected, decimal Adjusted, decimal Net);
