using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Application.Services;

public sealed class PtEntitlementQueryService(ISportHubDbContext db) : IPtEntitlementQueryService
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;

    public async Task<IReadOnlyList<PtEntitlementResponse>> SearchAsync(
        Guid? memberId, Guid? coachId, string? status,
        int page, int pageSize, CancellationToken ct = default)
    {
        var query = db.Set<PtEntitlement>().AsNoTracking();

        if (memberId is not null)
        {
            query = query.Where(e => e.MemberId == memberId);
        }

        if (coachId is not null)
        {
            query = query.Where(e => e.CoachId == coachId);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<PtEntitlementStatus>(status, ignoreCase: true, out var parsed))
            {
                throw new BadRequestException("pt_entitlement_not_found", $"Trạng thái '{status}' không hợp lệ.");
            }

            query = query.Where(e => e.Status == parsed);
        }

        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize);
        return await query.OrderByDescending(e => e.ActivatedAt).ThenBy(e => e.EntitlementId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(Projection()).ToListAsync(ct);
    }

    private static Expression<Func<PtEntitlement, PtEntitlementResponse>> Projection()
        => e => new PtEntitlementResponse(
            e.EntitlementId,
            e.MemberId,
            e.Member!.Profile != null ? e.Member.Profile.FullName : e.Member.Email,
            e.CoachId,
            e.Coach!.Profile != null ? e.Coach.Profile.FullName : e.Coach.Email,
            e.FrequencyPerWeek,
            e.TotalQuota,
            e.ReservedSessions,
            e.ConsumedSessions,
            e.TotalQuota - e.ReservedSessions - e.ConsumedSessions,
            e.ValidityStartDate,
            e.ValidityEndDate,
            e.CarryOverUntilDate,
            e.Status.ToString());
}
