using SportHub.Payment.Application.DTOs;

namespace SportHub.Payment.Application.Services;

/// <summary>Shared by the API and exports so dimensional filters cannot diverge.</summary>
public static class RevenueDimensionFilter
{
    public static IReadOnlyList<RevenueReportDimensionRowResponse> Apply(
        IEnumerable<RevenueReportDimensionRowResponse> rows, int? sportId = null,
        string? source = null, Guid? memberId = null, bool rentalsOnly = false)
        => rows.Where(r => (!sportId.HasValue || r.SportId == sportId)
            && (string.IsNullOrWhiteSpace(source) || string.Equals(r.Source.Replace("_", ""), source.Replace("_", ""), StringComparison.OrdinalIgnoreCase))
            && (!memberId.HasValue || r.MemberId == memberId)
            && (!rentalsOnly || r.Source == "Rental")).ToList();
}
