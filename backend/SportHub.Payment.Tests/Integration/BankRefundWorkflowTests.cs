using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.BankRefunds;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

/// <summary>Bank refund through Support Request: ownership, roles, evidence, caps, race with point refunds, DONE and reporting.</summary>
[Collection(nameof(PaymentApiCollection))]
public sealed class BankRefundWorkflowTests(PaymentApiFactory factory)
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];

    private sealed record Fixture(Guid MemberId, Guid ReceptionistId, Guid ManagerId, Guid InvoiceId, Guid InvoiceItemId, Guid MemberPackageId);

    /// <summary>1,000,000 VND paid in cash for a 90-day membership started 10 days ago: 80 days left, so the policy suggests 50%.</summary>
    private async Task<Fixture> SeedPaidMembershipAsync(int dayPass = 0)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHub.API.Persistence.SportHubDbContext>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var catalog = new MembershipPackage
        {
            Name = $"Bank refund package {Guid.NewGuid():N}", Price = 1_000_000, DurationDays = 90, SessionLimit = 30, IsActive = true
        };
        db.MembershipPackages.Add(catalog);
        await db.SaveChangesAsync();
        var invoiceId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var packageId = Guid.NewGuid();
        var package = new MemberPackage
        {
            MemberPackageId = packageId, MemberId = member.UserId, PackageId = dayPass == 0 ? catalog.PackageId : dayPass,
            StartDate = today.AddDays(-10), EndDate = today.AddDays(80), RemainingSessions = 30, Status = MemberPackageStatus.Active
        };
        var invoice = new Invoice
        {
            InvoiceId = invoiceId, InvoiceNumber = $"BR-{Guid.NewGuid():N}"[..20], MemberId = member.UserId,
            IssuedByUserId = receptionist.UserId, MemberPackageId = packageId, TotalAmount = 1_000_000, CashAmount = 1_000_000,
            Status = InvoiceStatus.Paid, IssuedAt = DateTime.UtcNow, PaidAtUtc = DateTime.UtcNow, PaidVia = "VnPay"
        };
        invoice.Items.Add(new InvoiceItem
        {
            ItemId = itemId, InvoiceId = invoiceId, ItemType = InvoiceItemType.Membership, Description = catalog.Name,
            UnitPrice = 1_000_000, Quantity = 1, LineAmount = 1_000_000, RelatedEntityId = packageId
        });
        db.MemberPackages.Add(package);
        db.Invoices.Add(invoice);
        db.Payments.Add(new SportHub.Payment.Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(), InvoiceId = invoiceId, Amount = 1_000_000, Method = PaymentMethod.VnPay,
            ReferenceCode = Guid.NewGuid().ToString("N"), Status = PaymentStatus.Success,
            ReceivedByUserId = receptionist.UserId, PaidAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        package.InvoiceItemId = itemId;
        await db.SaveChangesAsync();
        return new Fixture(member.UserId, receptionist.UserId, manager.UserId, invoiceId, itemId, packageId);
    }

    private static MultipartFormDataContent Form(IEnumerable<(string Key, string Value)> fields, int images = 1,
        string contentType = "image/png", byte[]? bytes = null)
    {
        var form = new MultipartFormDataContent();
        foreach (var (key, value) in fields) form.Add(new StringContent(value), key);
        for (var i = 0; i < images; i++)
        {
            var file = new ByteArrayContent(bytes ?? Png);
            file.Headers.ContentType = new(contentType);
            form.Add(file, "Files", $"proof-{i}.png");
        }
        return form;
    }

    private static (string, string)[] PaymentFields(Guid itemId, string? bank = "Vietcombank", string? number = "0123456789",
        string? holder = "NGUYEN VAN A", Guid? memberId = null)
    {
        var list = new List<(string, string)>
        {
            ("Category", "PAYMENT"), ("Subject", "Refund to my bank account"),
            ("Description", "Please review my refund request."), ("InvoiceItemId", itemId.ToString())
        };
        if (bank is not null) list.Add(("BankName", bank));
        if (number is not null) list.Add(("AccountNumber", number));
        if (holder is not null) list.Add(("AccountHolder", holder));
        if (memberId is not null) list.Add(("MemberId", memberId.ToString()!));
        return [.. list];
    }

    private async Task<Guid> MemberSubmitsAsync(Fixture f)
    {
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);
        var response = await member.PostAsync("/api/support/requests", Form(PaymentFields(f.InvoiceItemId)));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
    }

    private static MultipartFormDataContent CompleteForm(decimal amount, Guid key, int images = 1, string note = "Refund per policy: unused membership term.")
        => Form([("CompletionKey", key.ToString()), ("PayoutAmount", amount.ToString()),
            ("TransferredAt", DateTimeOffset.UtcNow.ToString("o")), ("BankReference", "FT26295123456"),
            ("Note", note)], images);

    [Fact]
    public async Task Member_must_supply_bank_details_a_transaction_and_valid_evidence_images()
    {
        var f = await SeedPaidMembershipAsync();
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);
        async Task<HttpStatusCode> Post(MultipartFormDataContent form) => (await member.PostAsync("/api/support/requests", form)).StatusCode;

        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId, bank: null))));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId, number: null))));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId, number: "12AB"))));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId, holder: null))));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId), images: 0)));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId), images: 4)));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId), bytes: "not an image at all"u8.ToArray())));
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(PaymentFields(f.InvoiceItemId), bytes: new byte[5 * 1024 * 1024 + 1])));
        var noItem = PaymentFields(f.InvoiceItemId).Where(x => x.Item1 != "InvoiceItemId");
        Assert.Equal(HttpStatusCode.BadRequest, await Post(Form(noItem)));
        Assert.Equal(0, await factory.QueryAsync(db => db.Set<BankRefundRequest>().CountAsync(x => x.MemberId == f.MemberId)));
    }

    [Fact]
    public async Task Member_cannot_request_a_refund_for_someone_elses_transaction_and_cannot_request_twice()
    {
        var f = await SeedPaidMembershipAsync();
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        using var other = factory.CreateApiClient(stranger.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await other.PostAsync("/api/support/requests", Form(PaymentFields(f.InvoiceItemId)))).StatusCode);

        var requestId = await MemberSubmitsAsync(f);
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Conflict,
            (await member.PostAsync("/api/support/requests", Form(PaymentFields(f.InvoiceItemId)))).StatusCode);

        // Another member can neither read the refund nor fetch its evidence.
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/bank-refunds/by-request/{requestId}")).StatusCode);
        var attachment = await factory.QueryAsync(db => db.Set<MemberSupportAttachment>().Where(a => a.RequestId == requestId)
            .Select(a => a.AttachmentId).SingleAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/support/attachments/{attachment}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/support/attachments/{attachment}")).StatusCode);
    }

    [Fact]
    public async Task Server_computes_the_snapshot_and_suggestion_and_ignores_any_client_figure()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        var view = await manager.GetFromJsonAsync<JsonElement>($"/api/bank-refunds/by-request/{requestId}");
        Assert.Equal("PENDING", view.GetProperty("status").GetString());
        Assert.Equal(500_000m, view.GetProperty("policy").GetProperty("suggestedVnd").GetDecimal());
        Assert.Equal(50m, view.GetProperty("policy").GetProperty("percent").GetDecimal());
        Assert.Equal(1_000_000m, view.GetProperty("service").GetProperty("paidTotalVnd").GetDecimal());
        Assert.Equal(1_000_000m, view.GetProperty("service").GetProperty("remainingRefundableVnd").GetDecimal());
        Assert.Equal(11, view.GetProperty("service").GetProperty("usedUnits").GetInt32());
        Assert.Equal("0123456789", view.GetProperty("account").GetProperty("accountNumber").GetString());
    }

    [Fact]
    public async Task Receptionist_can_create_on_behalf_and_follow_but_cannot_approve_assign_or_close_and_sees_a_masked_account()
    {
        var f = await SeedPaidMembershipAsync();
        using var reception = factory.CreateApiClient(f.ReceptionistId, UserRole.Receptionist);
        // JSON creation cannot carry the evidence images a Payment request needs.
        Assert.Equal(HttpStatusCode.BadRequest, (await reception.PostAsJsonAsync("/api/member-support-requests", new
        {
            memberId = f.MemberId, category = "PAYMENT", description = "Refund please", invoiceItemId = f.InvoiceItemId,
            bankName = "ACB", accountNumber = "0123456789", accountHolder = "A"
        })).StatusCode);
        var created = await reception.PostAsync("/api/member-support-requests",
            Form(PaymentFields(f.InvoiceItemId, memberId: f.MemberId)));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();

        Assert.Equal(HttpStatusCode.Forbidden, (await reception.PostAsJsonAsync(
            $"/api/member-support-requests/{requestId}/assign", new { assigneeUserId = f.ReceptionistId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reception.PostAsJsonAsync(
            $"/api/member-support-requests/{requestId}/done", new { reason = "closing it" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reception.PostAsJsonAsync(
            $"/api/member-support-requests/{requestId}/reject", new { reason = "closing it" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reception.PostAsJsonAsync(
            $"/api/bank-refunds/by-request/{requestId}/approve", new { amount = 500_000, reason = "approve it" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reception.PostAsync(
            $"/api/bank-refunds/by-request/{requestId}/complete", CompleteForm(500_000, Guid.NewGuid()))).StatusCode);

        var view = await reception.GetFromJsonAsync<JsonElement>($"/api/bank-refunds/by-request/{requestId}");
        Assert.True(view.GetProperty("account").GetProperty("masked").GetBoolean());
        Assert.DoesNotContain("0123456789", view.GetProperty("account").GetProperty("accountNumber").GetString());
        // Receptionist may not hand the ticket to another role and may not resolve it at creation.
        var instant = await reception.PostAsync("/api/member-support-requests", Form(
            [.. PaymentFields(f.InvoiceItemId, memberId: f.MemberId), ("ResolveNote", "done at the desk")]));
        Assert.Equal(HttpStatusCode.BadRequest, instant.StatusCode);
    }

    [Fact]
    public async Task Coach_and_administrator_cannot_see_or_process_payment_refunds()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        foreach (var role in new[] { UserRole.Coach, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync(role);
            using var client = factory.CreateApiClient(user.UserId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/bank-refunds/by-request/{requestId}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
                $"/api/bank-refunds/by-request/{requestId}/approve", new { amount = 1000, reason = "not allowed" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
                $"/api/member-support-requests/{requestId}/done", new { reason = "not allowed" })).StatusCode);
        }
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync(
            $"/api/member-support-requests/{requestId}/assign", new { assigneeUserId = admin.UserId, note = "escalate it" })).StatusCode);
    }

    [Fact]
    public async Task Manager_approval_is_capped_locks_the_benefit_and_blocks_a_point_refund_for_the_same_value()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);

        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/approve",
            new { amount = 1_000_001, reason = "More than was paid" })).StatusCode);
        // A different amount than the suggestion needs a real explanation.
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/approve",
            new { amount = 400_000, reason = "short" })).StatusCode);
        var approved = await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/approve",
            new { amount = 400_000, reason = "Agreed goodwill amount below policy" });
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        var view = await approved.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("APPROVED_AWAITING_PAYOUT", view.GetProperty("status").GetString());
        Assert.Equal("APPROVED_AWAITING_PAYOUT", view.GetProperty("ticketStatus").GetString());

        var state = await factory.QueryAsync(async db => new
        {
            Package = await db.MemberPackages.Where(x => x.MemberPackageId == f.MemberPackageId).Select(x => x.Status).SingleAsync(),
            Points = await db.Set<SportHub.Payment.Wallet.Domain.PointLedgerEntry>().CountAsync(x => x.InvoiceItemId == f.InvoiceItemId)
        });
        Assert.Equal(MemberPackageStatus.Cancelled, state.Package);
        Assert.Equal(0, state.Points); // nothing was credited: approval does not move money or points

        // The same item can no longer be refunded as points, and no second bank request can be filed.
        Assert.NotEqual(HttpStatusCode.OK, (await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = f.InvoiceItemId, reason = "Trying to get points as well" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await member.PostAsync("/api/support/requests", Form(PaymentFields(f.InvoiceItemId)))).StatusCode);
        // The ticket can only be finished through the refund workflow, never the generic close.
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(
            $"/api/member-support-requests/{requestId}/done", new { reason = "Closing without a transfer" })).StatusCode);
        // An approved refund cannot be rejected: the benefit already ended.
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(
            $"/api/bank-refunds/by-request/{requestId}/reject", new { reason = "Changed my mind" })).StatusCode);
    }

    [Fact]
    public async Task Completing_requires_evidence_matching_amount_and_records_exactly_one_payout_with_notifications()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);
        using var reception = factory.CreateApiClient(f.ReceptionistId, UserRole.Receptionist);

        // Cannot complete before approval.
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(500_000, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/approve",
            new { amount = 500_000, reason = "Policy: 50% of an unused term" })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(500_000, Guid.NewGuid(), images: 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(500_000, Guid.NewGuid(), images: 4))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(499_000, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(500_000, Guid.NewGuid(), note: "short"))).StatusCode);

        var key = Guid.NewGuid();
        var done = await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete", CompleteForm(500_000, key));
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        var view = await done.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("PAID", view.GetProperty("status").GetString());
        Assert.Equal("DONE", view.GetProperty("ticketStatus").GetString());

        // A network retry with the same key returns the stored result; a different key is a second completion.
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(500_000, key))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete",
            CompleteForm(500_000, Guid.NewGuid()))).StatusCode);

        var state = await factory.QueryAsync(async db => new
        {
            Proofs = await db.Set<MemberSupportAttachment>().Where(a => a.RequestId == requestId && a.Kind == SupportAttachmentKinds.PayoutProof).CountAsync(),
            Evidence = await db.Set<MemberSupportAttachment>().Where(a => a.RequestId == requestId && a.Kind == SupportAttachmentKinds.Evidence).CountAsync(),
            Notices = await db.Notifications.Where(n => n.UserId == f.MemberId && n.SourceEventType == NotificationSourceEventType.RefundCompleted).ToListAsync(),
            Audits = await db.AuditLogs.CountAsync(a => a.Action == "COMPLETE_BANK_REFUND" && a.TargetId == view.GetProperty("bankRefundId").GetString())
        });
        Assert.Equal(1, state.Proofs);
        Assert.Equal(1, state.Evidence);
        Assert.Equal(1, state.Audits);
        Assert.Equal(2, state.Notices.Count); // one in-app, one email — never duplicated by the retry
        Assert.All(state.Notices, n => Assert.DoesNotContain("0123456789", n.Message));

        // The member and the front desk can both read the outcome and open the receipt; strangers cannot.
        var mine = await member.GetFromJsonAsync<JsonElement>("/api/support/requests/mine");
        var ticket = mine.EnumerateArray().Single(x => x.GetProperty("requestId").GetGuid() == requestId);
        var proofId = ticket.GetProperty("resultAttachments")[0].GetProperty("attachmentId").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await reception.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
        var staffView = await reception.GetFromJsonAsync<JsonElement>($"/api/bank-refunds/by-request/{requestId}");
        Assert.Equal(500_000m, staffView.GetProperty("payout").GetProperty("amount").GetDecimal());
        Assert.Contains("unused membership term", staffView.GetProperty("payout").GetProperty("note").GetString());
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        using var other = factory.CreateApiClient(stranger.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
    }

    [Fact]
    public async Task Rejection_needs_a_reason_and_leaves_the_benefit_and_the_item_untouched()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync(
            $"/api/bank-refunds/by-request/{requestId}/reject", new { reason = "no" })).StatusCode);
        var rejected = await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/reject",
            new { reason = "The membership was already used heavily" });
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        var package = await factory.QueryAsync(db => db.MemberPackages.Where(x => x.MemberPackageId == f.MemberPackageId).Select(x => x.Status).SingleAsync());
        Assert.Equal(MemberPackageStatus.Active, package);
        // A rejected request frees the item for a new, corrected one.
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsync("/api/support/requests", Form(PaymentFields(f.InvoiceItemId)))).StatusCode);
    }

    [Fact]
    public async Task Paid_bank_refund_is_reported_once_and_apart_from_point_refunds()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        var from = DateTime.UtcNow.AddHours(7).ToString("yyyy-MM-dd");
        var before = await manager.GetFromJsonAsync<JsonElement>($"/api/reports/revenue?fromDate={from}&toDate={from}");
        await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/approve",
            new { amount = 500_000, reason = "Policy: 50% of an unused term" });
        // Approval alone is not money out of the till.
        var approvedOnly = await manager.GetFromJsonAsync<JsonElement>($"/api/reports/revenue?fromDate={from}&toDate={from}");
        Assert.Equal(before.GetProperty("totalRefunded").GetDecimal(), approvedOnly.GetProperty("totalRefunded").GetDecimal());
        await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete", CompleteForm(500_000, Guid.NewGuid()));
        var after = await manager.GetFromJsonAsync<JsonElement>($"/api/reports/revenue?fromDate={from}&toDate={from}");
        Assert.Equal(before.GetProperty("totalRefunded").GetDecimal() + 500_000m, after.GetProperty("totalRefunded").GetDecimal());
        Assert.Equal(before.GetProperty("bankRefundAmount").GetDecimal() + 500_000m, after.GetProperty("bankRefundAmount").GetDecimal());
        Assert.Equal(before.GetProperty("pointsRefunded").GetInt64(), after.GetProperty("pointsRefunded").GetInt64());
    }

    [Fact]
    public async Task Gym_day_pass_cannot_be_refunded_to_a_bank_account()
    {
        var f = await SeedPaidMembershipAsync(dayPass: SportHub.Membership.Domain.DayPass.PackageId);
        using var member = factory.CreateApiClient(f.MemberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Conflict,
            (await member.PostAsync("/api/support/requests", Form(PaymentFields(f.InvoiceItemId)))).StatusCode);
        var items = await member.GetFromJsonAsync<JsonElement>("/api/bank-refunds/items");
        Assert.False(items.EnumerateArray().Single(x => x.GetProperty("invoiceItemId").GetGuid() == f.InvoiceItemId)
            .GetProperty("eligible").GetBoolean());
    }

    [Fact]
    public async Task Flagging_a_transferred_but_unrecorded_payout_marks_it_for_reconciliation_and_never_completes_it()
    {
        var f = await SeedPaidMembershipAsync();
        var requestId = await MemberSubmitsAsync(f);
        using var manager = factory.CreateApiClient(f.ManagerId, UserRole.CenterManager);
        await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/approve",
            new { amount = 500_000, reason = "Policy: 50% of an unused term" });
        var flagged = await manager.PostAsJsonAsync($"/api/bank-refunds/by-request/{requestId}/flag-payout",
            new { note = "Transferred at 10:12 but the upload failed; check the statement before any retry." });
        Assert.Equal(HttpStatusCode.OK, flagged.StatusCode);
        var view = await flagged.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(view.GetProperty("needsReconciliation").GetBoolean());
        Assert.Equal("APPROVED_AWAITING_PAYOUT", view.GetProperty("status").GetString());
        var list = await manager.GetFromJsonAsync<JsonElement>("/api/bank-refunds?needsReconciliation=true");
        Assert.Contains(list.EnumerateArray(), x => x.GetProperty("supportRequestId").GetGuid() == requestId);
        // Recording the transfer later clears the flag.
        await manager.PostAsync($"/api/bank-refunds/by-request/{requestId}/complete", CompleteForm(500_000, Guid.NewGuid()));
        var final = await manager.GetFromJsonAsync<JsonElement>($"/api/bank-refunds/by-request/{requestId}");
        Assert.False(final.GetProperty("needsReconciliation").GetBoolean());
    }
}
