using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Membership.Application.Services;

public sealed class IncidentDayPassService(ISportHubDbContext db) : IIncidentDayPassService
{
    public async Task<IReadOnlyList<IncidentDayPass>> FindAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
        => await db.Set<MemberPackage>().AsNoTracking()
            .Where(p => p.PackageId == DayPass.PackageId && p.InvoiceItemId != null && p.StartDate >= from && p.StartDate <= to)
            .OrderBy(p => p.MemberPackageId)
            .Select(p => new IncidentDayPass(p.MemberPackageId, p.MemberId, p.InvoiceItemId!.Value, p.StartDate, p.Status.ToString(), p.ExpiresAtUtc))
            .ToListAsync(ct);

    public async Task CancelAsync(Guid passId, CancellationToken ct = default)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Incident cancellation requires a transaction.");
        var pass = await db.Set<MemberPackage>().FromSqlInterpolated(
            $"SELECT * FROM member_packages WHERE member_package_id = {passId} FOR UPDATE").SingleAsync(ct);
        if (pass.PackageId != DayPass.PackageId)
            throw new ConflictException("incident_day_pass_only", "Only Gym day passes can be cancelled by an incident.");
        if (pass.Status == MemberPackageStatus.Cancelled) return;
        pass.Status = MemberPackageStatus.Cancelled;
        pass.Version++;
        await db.SaveChangesAsync(ct);
    }
}
