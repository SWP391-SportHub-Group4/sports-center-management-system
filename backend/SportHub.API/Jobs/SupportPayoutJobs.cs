using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;

namespace SportHub.API.Jobs;

public sealed class SupportPayoutAutoConfirmJob(IServiceProvider services,
    ILogger<SupportPayoutAutoConfirmJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromHours(1))
{
    protected override string JobName => nameof(SupportPayoutAutoConfirmJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => await scopedServices.GetRequiredService<SupportPayoutMaintenance>().AutoConfirmAsync(ct);
}

public sealed class SupportPayoutMaintenance(ISportHubDbContext db, IClock clock,
    ISystemSettingProvider settings, IAuditWriter audit)
{
    public async Task RunAsync(CancellationToken ct)
    {
        await AutoConfirmAsync(ct);
    }

    public async Task AutoConfirmAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var confirmDays = await settings.GetIntAsync(SystemSettingKeys.SupportPayoutConfirmDays, ct);
        var toConfirm = await db.Set<MemberSupportPayout>().AsNoTracking()
            .Where(p => p.MemberConfirmedAtUtc == null && p.RecordedAtUtc <= now.AddDays(-confirmDays)
                && db.Set<MemberSupportRequest>().Any(r => r.RequestId == p.RequestId && r.Status == "CLOSED"))
            .OrderBy(p => p.RecordedAtUtc).Select(p => p.RequestId).Take(100).ToListAsync(ct);
        foreach (var requestId in toConfirm)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var request = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
                $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE")
                .SingleOrDefaultAsync(ct);
            var payout = await db.Set<MemberSupportPayout>().SingleOrDefaultAsync(x => x.RequestId == requestId, ct);
            if (request?.Status == "CLOSED" && payout?.MemberConfirmedAtUtc is null
                && payout?.RecordedAtUtc <= now.AddDays(-confirmDays))
            {
                payout.MemberConfirmedAtUtc = now;
                payout.MemberConfirmedBy = "SYSTEM";
                db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
                {
                    EventId = Guid.NewGuid(), RequestId = requestId, Type = "MEMBER_CONFIRMED_RECEIVED",
                    CreatedAt = now
                });
                audit.Write(new AuditEntry(request.MemberId, "SUPPORT_PAYOUT_AUTO_CONFIRMED",
                    nameof(MemberSupportPayout), payout.PayoutId.ToString(), NewValue: JsonSerializer.Serialize(new {
                        request.RequestId, payout.InvoiceId, payout.Amount, received = true, confirmedBy = "SYSTEM"
                    }), IsSystem: true));
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
    }
}
