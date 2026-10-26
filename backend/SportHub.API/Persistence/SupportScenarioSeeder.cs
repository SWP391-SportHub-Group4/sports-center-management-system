using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.API.Persistence;

/// <summary>Additive local support scenarios; never changes accounts, invoices or payouts.</summary>
public sealed class SupportScenarioSeeder(SportHubDbContext db, IClock clock,
    ISupportInvoiceGuard invoiceGuard, ILogger<SupportScenarioSeeder> logger)
{
    private const string Prefix = "[Support seed v1] ";

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var users = await db.UserAccounts.AsNoTracking().Include(x => x.Role)
            .Where(x => x.Status == UserStatus.Active && x.Role != null)
            .OrderBy(x => x.Email).ToListAsync(ct);
        UserAccount First(UserRole role) => users.FirstOrDefault(x => x.Role!.RoleName == role)
            ?? throw new InvalidOperationException($"An active {role} account is required. Existing accounts are never modified.");
        var member = First(UserRole.Member);
        var secondMember = users.FirstOrDefault(x => x.Role!.RoleName == UserRole.Member && x.UserId != member.UserId) ?? member;
        var manager = First(UserRole.CenterManager);
        var desk = First(UserRole.Receptionist);
        _ = First(UserRole.Coach);
        _ = First(UserRole.SystemAdministrator);
        var now = clock.UtcNow;
        var created = 0;
        var skipped = 0;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026101301)", ct);
        var subjects = (await db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(x => x.Subject.StartsWith(Prefix)).Select(x => x.Subject).ToListAsync(ct)).ToHashSet();

        async Task Add(string key, string category, string status, UserAccount owner,
            UserAccount? assignee = null, bool overdue = false, string channel = "ONLINE",
            bool handover = false, bool reminder = false, Guid? invoiceId = null)
        {
            var subject = Prefix + key;
            if (!subjects.Add(subject)) { skipped++; return; }
            var start = now.AddHours(overdue ? -72 : -12);
            var assignedAt = start.AddHours(1);
            var progressAt = start.AddHours(2);
            var finalAt = start.AddHours(3);
            var final = status is "DONE" or "REJECTED" or "CLOSED";
            var note = status switch
            {
                "IN_PROGRESS" => "The assigned staff member is reviewing the member's issue.",
                "DONE" => "The issue was resolved and the outcome was recorded for the member.",
                "REJECTED" => "The request was rejected after review because it is outside the applicable policy.",
                "CLOSED" => "Historical closed support request. No transfer or financial settlement is implied.",
                _ => (string?)null
            };
            var request = new MemberSupportRequest
            {
                RequestId = Guid.NewGuid(), MemberId = owner.UserId,
                RecordedByUserId = channel == "ONLINE" ? owner.UserId : desk.UserId,
                Category = category, Subject = subject,
                Description = $"Local scenario: {key}. Review the status, history, filters and role permissions. This record does not create a payment or payout.",
                Status = status, Channel = channel, CreatedAt = start,
                SlaDueAtUtc = overdue ? now.AddHours(-24) : now.AddHours(36),
                AssignedToUserId = assignee?.UserId, ProgressNote = note,
                UpdatedAt = final ? finalAt : status == "IN_PROGRESS" ? progressAt : assignee is null ? null : assignedAt,
                ClosedAt = final ? finalAt : null, InvoiceId = invoiceId,
                RemindCount = reminder ? 1 : 0,
                LastMemberRemindAtUtc = reminder ? now.AddHours(-1) : null
            };
            db.Set<MemberSupportRequest>().Add(request);
            void Event(string type, Guid actor, DateTime at, string? text = null, Guid? target = null) =>
                db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
                {
                    EventId = Guid.NewGuid(), RequestId = request.RequestId, Type = type,
                    ActorUserId = actor, CreatedAt = at, Note = text, TargetUserId = target
                });
            Event("CREATED", request.RecordedByUserId, start);
            if (assignee is not null)
            {
                if (handover)
                    Event("ASSIGNED", desk.UserId, start.AddMinutes(30), "Taken by the front desk.", desk.UserId);
                Event("ASSIGNED", manager.UserId, assignedAt, "Assigned to the responsible staff member.", assignee.UserId);
                if (status is "IN_PROGRESS" or "DONE" or "REJECTED" or "CLOSED")
                    Event("PROGRESS", assignee.UserId, progressAt, "The issue is being investigated.");
            }
            if (final)
                Event(status, status == "REJECTED" ? manager.UserId : assignee!.UserId, finalAt, note);
            if (reminder)
                Event("REMINDED_BY_MEMBER", owner.UserId, now.AddHours(-1), "Please check the outstanding request.");
            created++;
            await db.SaveChangesAsync(ct);
        }

        foreach (var category in new[] { "MEMBERSHIP", "CLASS", "FACILITY", "ACCOUNT", "OTHER" })
            await Add($"Received / {category}", category, "OPEN", member);
        await Add("Unassigned overdue", "FACILITY", "OPEN", member, overdue: true);
        await Add("Member reminder", "ACCOUNT", "OPEN", member, overdue: true, reminder: true);
        await Add("Second member privacy", "OTHER", "OPEN", secondMember);
        foreach (var handler in users.Where(x => x.Role!.RoleName != UserRole.Member))
        {
            var category = handler.Role!.RoleName switch
            {
                UserRole.Coach => "CLASS",
                UserRole.SystemAdministrator => "ACCOUNT",
                _ => "FACILITY"
            };
            foreach (var status in new[] { "ASSIGNED", "IN_PROGRESS", "DONE", "REJECTED", "CLOSED" })
                await Add($"{handler.Email} / {status}", category, status, member, handler,
                    handover: true);
            await Add($"{handler.Email} / Overdue", category, "IN_PROGRESS", secondMember,
                handler, overdue: true, handover: true, reminder: true);
        }
        foreach (var channel in new[] { "COUNTER", "PHONE", "FANPAGE" })
            await Add($"Recorded via {channel}", "OTHER", "ASSIGNED", member, desk, channel: channel);
        await Add("Legacy GENERAL category", "GENERAL", "DONE", member, desk);
        await Add("Legacy PT category", "PT", "DONE", member, manager);

        // Only reference existing real invoices that pass the application's eligibility guard.
        var invoices = await db.Set<Invoice>().AsNoTracking()
            .Where(x => x.Status == InvoiceStatus.Paid && x.ResolutionIdempotencyKey == null)
            .OrderByDescending(x => x.PaidAtUtc).ToListAsync(ct);
        var paymentCases = 0;
        var existingPaymentCases = subjects.Count(x => x.StartsWith(Prefix + "Payment review / ", StringComparison.Ordinal));
        foreach (var invoice in invoices)
        {
            if (existingPaymentCases + paymentCases >= 2) break;
            var owner = users.FirstOrDefault(x => x.UserId == invoice.MemberId && x.Role!.RoleName == UserRole.Member);
            if (owner is null) continue;
            var key = $"Payment review / {invoice.InvoiceId}";
            if (subjects.Contains(Prefix + key)) { skipped++; continue; }
            try { await invoiceGuard.EnsureEligibleAsync(owner.UserId, invoice.InvoiceId, ct); }
            catch (BadRequestException) { continue; }
            catch (ConflictException) { continue; }
            await Add(key, "PAYMENT", "ASSIGNED", owner, manager, invoiceId: invoice.InvoiceId);
            paymentCases++;
        }
        await tx.CommitAsync(ct);
        logger.LogInformation("Support scenarios: {Created} created, {Skipped} existing records preserved, {Payments} payment reviews added using existing invoices. No accounts, payments, payouts or notification deliveries were created.",
            created, skipped, paymentCases);
        if (existingPaymentCases + paymentCases == 0)
            logger.LogInformation("Payment/payout scenarios require eligible existing invoices and real transfer proof; no financial history was fabricated.");
    }
}
