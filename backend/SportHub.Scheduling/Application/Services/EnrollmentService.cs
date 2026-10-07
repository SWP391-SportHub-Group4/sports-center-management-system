using SportHub.Identity.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

public sealed class EnrollmentService(ISportHubDbContext db) : IEnrollmentService
{
    public const int MaxPageSize = 100;

    public async Task<PagedResult<EnrollmentResponse>> ListForMemberAsync(
        Guid memberId, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, MaxPageSize);

        var query = db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == memberId);
        var total = await query.CountAsync(ct);

        var now = DateTime.UtcNow;
        var items = await query
            .OrderByDescending(e => e.EnrolledAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new EnrollmentResponse(
                e.EnrollmentId,
                e.ClassId,
                e.Class!.Code,
                e.Class.Name,
                e.Class.Sport!.Name,
                e.MemberId,
                e.Status.ToString(),
                e.EnrolledAt,
                e.EndedAt,
                e.Class.NumSessions,
                e.Class.Sessions.Where(s => s.Status != ClassSessionStatus.Cancelled).Min(s => (DateTime?)s.StartAtUtc),
                e.Class.Status.ToString(), e.InvoiceItemId,
                db.Set<UserAccount>().Where(u => u.UserId == e.Class.CoachId)
                    .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault(),
                e.Class.DefaultRoom!.Name,
                e.Class.Sessions.Where(s => s.Status != ClassSessionStatus.Cancelled).Max(s => (DateTime?)s.EndAtUtc),
                e.Class.Sessions.Count(s => s.Status != ClassSessionStatus.Cancelled && s.EndAtUtc <= now)))
            .ToListAsync(ct);

        return new PagedResult<EnrollmentResponse> { Items = items, Page = page, PageSize = pageSize, TotalCount = total };
    }
}
