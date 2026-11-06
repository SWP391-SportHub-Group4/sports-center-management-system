using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member-only, read-only query boundary. Never accepts an identity supplied by the LLM.
/// This is a logical read boundary, not a database credential boundary: the caller's
/// DbContext can still write AiLog after this method returns. For DB-enforced SELECT-only
/// access, a separately configured database user/connection is required.
/// </summary>
internal static class MemberReadOnlyGateway
{
    private static readonly TimeSpan QueryBudget = TimeSpan.FromSeconds(12);

    internal static async Task<object> LoadEvidenceAsync(
        ISportHubDbContext db,
        Guid authenticatedUserId,
        MemberEvidenceDomain domain,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        if (authenticatedUserId == Guid.Empty)
            throw new UnauthorizedAccessException("Authenticated Member identity is required.");

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(QueryBudget);

        // Server-side role verification. A question or a Gemini argument cannot select a Member ID.
        var member = await db.Set<UserAccount>().AsNoTracking()
            .AnyAsync(u => u.UserId == authenticatedUserId && u.Role != null &&
                u.Role.RoleName == UserRole.Member, timeout.Token);
        if (!member)
            throw new UnauthorizedAccessException("Member Data Hub is available only to the authenticated Member.");

        // Every personalized query inside MemberDataHub filters by authenticatedUserId.
        // All entity reads use AsNoTracking and bounded projections; no mutations here.
        return await MemberDataHub.LoadEvidenceAsync(
            db, authenticatedUserId, domain, nowUtc, timeout.Token);
    }
}
