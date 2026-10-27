using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Audit.Domain.Entities;
using SportHub.API.Jobs;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class SupportPayoutFlowTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Payout_quote_deducts_previous_refunds_and_settlement_exhausts_only_the_remaining_value()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        var itemId = invoice.Items.Single().ItemId;
        await factory.QueryAsync(async db =>
        {
            var row = await db.Set<Invoice>().SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.Status = InvoiceStatus.Paid; row.CheckoutCycleId = Guid.NewGuid(); row.PointsApplied = 20; row.CashAmount = 80_000m;
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new() { PaymentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId, Amount = 80_000m, Method = PaymentMethod.VnPay,
                Status = PaymentStatus.Success, ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        using (var scope = factory.Services.CreateScope())
        {
            var state = scope.ServiceProvider.GetRequiredService<SportHub.API.Persistence.SportHubDbContext>();
            await using var tx = await state.Database.BeginTransactionAsync();
            var wallets = scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Wallet.IPointWalletService>();
            await wallets.EarnAsync(new SportHub.BuildingBlocks.Abstractions.Wallet.WalletOperation(member.UserId,
                30, "SystemEvent", Guid.NewGuid(), null, "Earlier partial refund", itemId), default);
            await tx.CommitAsync();
        }
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var form = Form(invoice.InvoiceId);
        var created = await owner.PostAsync("/api/support/requests", form);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        var endpoint = $"/api/member-support-requests/{requestId}";
        var quote = await mgr.GetFromJsonAsync<JsonElement>(endpoint + "/payout-quote");
        var item = quote.GetProperty("items")[0];
        Assert.Equal(56_000m, item.GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(14, item.GetProperty("refundablePoints").GetInt32());
        using var payout = new MultipartFormDataContent();
        payout.Add(new StringContent("56000"), "Amount");
        payout.Add(new StringContent("14"), "PointsRefunded");
        payout.Add(new StringContent("Called the member and transferred the remaining service value"), "Note");
        AddPng(payout);
        Assert.Equal(HttpStatusCode.OK, (await mgr.PostAsync(endpoint + "/payout", payout)).StatusCode);
        using var verify = factory.Services.CreateScope();
        var refunds = verify.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Payment.IRefundCreditService>();
        Assert.Equal(0m, await refunds.GetRemainingItemValueVndAsync(itemId, default));
        var db = verify.ServiceProvider.GetRequiredService<SportHub.API.Persistence.SportHubDbContext>();
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task Multi_item_hybrid_refunds_are_scoped_and_cannot_be_finished_without_payout()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 200_000m);
        var firstItemId = invoice.Items.Single().ItemId;
        var secondItemId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            var row = await db.Set<Invoice>().SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.CheckoutCycleId = Guid.NewGuid(); row.PointsApplied = 40; row.CashAmount = 160_000m;
            row.Status = InvoiceStatus.Paid;
            var first = await db.Set<InvoiceItem>().SingleAsync(i => i.ItemId == firstItemId);
            first.LineAmount = first.UnitPrice = 100_000m; first.Description = "Service A";
            db.Set<InvoiceItem>().Add(new InvoiceItem { ItemId = secondItemId, InvoiceId = invoice.InvoiceId,
                ItemType = InvoiceItemType.Membership, Description = "Service B", Quantity = 1,
                UnitPrice = 100_000m, LineAmount = 100_000m });
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new() { PaymentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId, Amount = 160_000m, Method = PaymentMethod.VnPay,
                Status = PaymentStatus.Success, ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var desk = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Receptionist)).UserId, UserRole.Receptionist);
        using (var missing = Form(invoice.InvoiceId))
            Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync("/api/support/requests", missing)).StatusCode);
        using (var foreign = Form(invoice.InvoiceId))
        {
            foreign.Add(new StringContent(Guid.NewGuid().ToString()), "InvoiceItemId");
            Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync("/api/support/requests", foreign)).StatusCode);
        }
        async Task<Guid> Create(Guid itemId)
        {
            using var form = Form(invoice.InvoiceId);
            form.Add(new StringContent(itemId.ToString()), "InvoiceItemId");
            var response = await owner.PostAsync("/api/support/requests", form);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        }
        var firstRequest = await Create(firstItemId);
        var secondRequest = await Create(secondItemId); // Different services may be handled independently.
        using (var duplicate = Form(invoice.InvoiceId))
        {
            duplicate.Add(new StringContent(firstItemId.ToString()), "InvoiceItemId");
            Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsync("/api/support/requests", duplicate)).StatusCode);
        }
        var endpoint = $"/api/member-support-requests/{firstRequest}";
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync(endpoint + "/payout-quote")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await desk.GetAsync(endpoint + "/payout-quote")).StatusCode);
        var quote = await mgr.GetFromJsonAsync<JsonElement>(endpoint + "/payout-quote");
        var itemQuote = quote.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("invoiceItemId").GetGuid() == firstItemId);
        Assert.Equal(80_000m, itemQuote.GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(20, itemQuote.GetProperty("refundablePoints").GetInt32());
        await mgr.PostAsJsonAsync(endpoint + "/assign", new { assigneeUserId = manager.UserId });
        Assert.Equal(HttpStatusCode.Conflict, (await mgr.PostAsJsonAsync(endpoint + "/done", new { reason = "Resolved" })).StatusCode);
        MultipartFormDataContent Payout(int amount, Guid? itemId = null)
        {
            var form = new MultipartFormDataContent();
            form.Add(new StringContent(amount.ToString()), "Amount");
            form.Add(new StringContent("20"), "PointsRefunded");
            form.Add(new StringContent("Called the member and transferred the service's VNPay share"), "Note");
            if (itemId != null) form.Add(new StringContent(itemId.ToString()!), "InvoiceItemId");
            AddPng(form); return form;
        }
        using (var wrong = Payout(90_000))
        {
            var response = await mgr.PostAsync(endpoint + "/payout", wrong);
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Equal("payout_amount_exceeds_paid", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
        using (var changedItem = Payout(80_000, secondItemId))
            Assert.Equal(HttpStatusCode.Conflict, (await mgr.PostAsync(endpoint + "/payout", changedItem)).StatusCode);
        using (var exact = Payout(80_000))
            Assert.Equal(HttpStatusCode.OK, (await mgr.PostAsync(endpoint + "/payout", exact)).StatusCode);
        using (var replay = Payout(80_000))
            Assert.Equal(HttpStatusCode.Conflict, (await mgr.PostAsync(endpoint + "/payout", replay)).StatusCode);
        var after = await owner.GetFromJsonAsync<JsonElement>($"/api/members/me/invoices/{invoice.InvoiceId}/refund-breakdown");
        var items = after.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(0m, items.Single(i => i.GetProperty("invoiceItemId").GetGuid() == firstItemId).GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(80_000m, items.Single(i => i.GetProperty("invoiceItemId").GetGuid() == secondItemId).GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(20, items.Single(i => i.GetProperty("invoiceItemId").GetGuid() == secondItemId).GetProperty("refundablePoints").GetInt32());
        await factory.QueryAsync(async db =>
        {
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(p => p.RequestId == firstRequest);
            Assert.Equal(firstItemId, payout.InvoiceItemId); Assert.Equal(20, payout.PointsRefunded);
            Assert.Equal(20, await db.PointWallets.Where(w => w.OwnerUserId == member.UserId).Select(w => w.AvailablePoints).SingleAsync());
            Assert.Equal("OPEN", await db.Set<MemberSupportRequest>().Where(r => r.RequestId == secondRequest).Select(r => r.Status).SingleAsync());
            return 0;
        });
    }

    private static MultipartFormDataContent Form(Guid invoiceId, int proofs = 1)
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent("PAYMENT"), "Category");
        form.Add(new StringContent("Captured payment needs support"), "Description");
        form.Add(new StringContent(invoiceId.ToString()), "InvoiceId");
        for (var i = 0; i < proofs; i++) AddPng(form);
        return form;
    }

    private static void AddPng(MultipartFormDataContent form)
    {
        var file = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0, 0]);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "Files", "proof.png");
    }

    [Fact]
    public async Task Member_can_report_a_void_invoice_without_a_confirmed_vnpay_charge()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        await factory.QueryAsync(async db =>
        {
            var row = await db.Invoices.SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.Status = InvoiceStatus.Void;
            return await db.SaveChangesAsync();
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var form = Form(invoice.InvoiceId);
        var response = await owner.PostAsync("/api/support/requests", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var breakdown = await owner.GetFromJsonAsync<JsonElement>(
            $"/api/members/me/invoices/{invoice.InvoiceId}/refund-breakdown");
        Assert.Equal(0m, breakdown.GetProperty("vnpayVnd").GetDecimal());
    }

    [Fact]
    public async Task Payment_request_and_payout_require_proof_and_enforce_roles_and_capture_limit()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var outsider = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        await factory.QueryAsync(async db =>
        {
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new SportHub.Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = 100_000m,
                Method = PaymentMethod.VnPay, Status = PaymentStatus.Success,
                ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var other = factory.CreateApiClient(outsider.UserId, UserRole.Member);
        using var desk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using (var noProof = Form(invoice.InvoiceId, 0))
        {
            var res = await owner.PostAsync("/api/support/requests", noProof);
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            Assert.Equal("payment_request_proof_required",
                (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
        using (var tooMany = Form(invoice.InvoiceId, 4))
            Assert.Equal(HttpStatusCode.BadRequest,
                (await owner.PostAsync("/api/support/requests", tooMany)).StatusCode);
        using (var missingInvoice = Form(Guid.Empty))
        {
            var res = await owner.PostAsync("/api/support/requests", missingInvoice);
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            Assert.Equal("payment_request_invoice_required",
                (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
        using (var otherForm = Form(invoice.InvoiceId))
            Assert.Equal(HttpStatusCode.BadRequest,
                (await other.PostAsync("/api/support/requests", otherForm)).StatusCode);
        using var form = Form(invoice.InvoiceId);
        var created = await owner.PostAsync("/api/support/requests", form);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        using (var duplicate = Form(invoice.InvoiceId))
            Assert.Equal(HttpStatusCode.Conflict,
                (await owner.PostAsync("/api/support/requests", duplicate)).StatusCode);
        // Front desk sees the request but cannot handle it; the member never submitted bank details.
        var deskView = await desk.GetFromJsonAsync<JsonElement>($"/api/member-support-requests/{requestId}");
        Assert.Equal("PAYMENT", deskView.GetProperty("category").GetString());
        foreach (var path in new[] { "assign", "progress", "done", "reject" })
        {
            using var body = JsonContent.Create(new { assigneeUserId = manager.UserId, note = "note", reason = "reason" });
            var res = await desk.PostAsync($"/api/member-support-requests/{requestId}/{path}", body);
            Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
            Assert.Equal("payment_request_manager_only",
                (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
        Assert.Equal(HttpStatusCode.Forbidden,
            (await desk.PostAsync($"/api/member-support-requests/{requestId}/payout", new MultipartFormDataContent())).StatusCode);
        using (var noPayoutProof = new MultipartFormDataContent())
        {
            noPayoutProof.Add(new StringContent("50000"), "Amount");
            noPayoutProof.Add(new StringContent("Called the member"), "Note");
            Assert.Equal(HttpStatusCode.BadRequest,
                (await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", noPayoutProof)).StatusCode);
        }
        using (var noNote = new MultipartFormDataContent())
        {
            noNote.Add(new StringContent("50000"), "Amount");
            AddPng(noNote);
            var res = await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", noNote);
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        }
        using (var excessive = new MultipartFormDataContent())
        {
            excessive.Add(new StringContent("101000"), "Amount");
            excessive.Add(new StringContent("Called the member"), "Note");
            AddPng(excessive);
            var res = await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", excessive);
            Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        }
        var today = DateOnly.FromDateTime(SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(DateTime.UtcNow));
        var reportUrl = $"/api/reports/revenue?fromDate={today.AddDays(-1):yyyy-MM-dd}&toDate={today.AddDays(1):yyyy-MM-dd}";
        var before = await mgr.GetFromJsonAsync<JsonElement>(reportUrl);
        using var payoutForm = new MultipartFormDataContent();
        payoutForm.Add(new StringContent("50000"), "Amount");
        payoutForm.Add(new StringContent("Called the member and agreed to refund by transfer"), "Note");
        AddPng(payoutForm);
        var recorded = await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", payoutForm);
        Assert.Equal(HttpStatusCode.OK, recorded.StatusCode);
        var payoutJson = await recorded.Content.ReadFromJsonAsync<JsonElement>();
        var proofId = payoutJson.GetProperty("proofAttachmentIds")[0].GetGuid();
        var after = await mgr.GetFromJsonAsync<JsonElement>(reportUrl);
        Assert.Equal(50_000m, after.GetProperty("bankRefundPaid").GetDecimal()
            - before.GetProperty("bankRefundPaid").GetDecimal());
        Assert.Equal(1, after.GetProperty("bankRefundCount").GetInt32()
            - before.GetProperty("bankRefundCount").GetInt32());
        // Bank refunds are a separate line: VNPay cash, cash refunds and net revenue do not move.
        Assert.Equal(before.GetProperty("totalCollected").GetDecimal(), after.GetProperty("totalCollected").GetDecimal());
        Assert.Equal(before.GetProperty("totalRefunded").GetDecimal(), after.GetProperty("totalRefunded").GetDecimal());
        Assert.Equal(before.GetProperty("netRevenue").GetDecimal(), after.GetProperty("netRevenue").GetDecimal());
        Assert.Equal(before.GetProperty("pointsRefunded").GetInt64(), after.GetProperty("pointsRefunded").GetInt64());
        await factory.QueryAsync(async db =>
        {
            var audit = await db.Set<AuditLog>().SingleAsync(x => x.Action == "SUPPORT_PAYOUT_RECORDED"
                && x.TargetId == payoutJson.GetProperty("payoutId").GetGuid().ToString());
            Assert.DoesNotContain("account", audit.NewValue, StringComparison.OrdinalIgnoreCase);
            return 0;
        });
        Assert.Equal(HttpStatusCode.NotFound,
            (await desk.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await owner.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await mgr.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.GetAsync($"/api/support/attachments/{proofId}")).StatusCode);
        using var repeat = new MultipartFormDataContent();
        repeat.Add(new StringContent("50000"), "Amount");
        repeat.Add(new StringContent("Second try"), "Note");
        AddPng(repeat);
        Assert.Equal(HttpStatusCode.Conflict,
            (await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", repeat)).StatusCode);
        var mine = await owner.GetFromJsonAsync<JsonElement>("/api/support/requests/mine");
        var row = mine.EnumerateArray().Single(x => x.GetProperty("requestId").GetGuid() == requestId);
        Assert.Equal(50_000m, row.GetProperty("payout").GetProperty("amount").GetDecimal());
        Assert.Contains(proofId.ToString(), row.GetProperty("payout").GetProperty("proofAttachmentIds").ToString());
        Assert.False(row.TryGetProperty("bankAccountMasked", out _));
        Assert.Equal(HttpStatusCode.OK,
            (await owner.PostAsync($"/api/support/requests/{requestId}/confirm-received", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await owner.PostAsync($"/api/support/requests/{requestId}/report-not-received", null)).StatusCode);
    }

    [Fact]
    public async Task Hybrid_invoice_payout_transfers_the_vnpay_share_and_returns_the_points_share_once()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        // 100.000đ = 20 points (20.000đ) + 80.000đ VNPay.
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        await factory.QueryAsync(async db =>
        {
            await db.Set<Invoice>().Where(x => x.InvoiceId == invoice.InvoiceId).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CheckoutCycleId, Guid.NewGuid())
                .SetProperty(x => x.PointsApplied, 20)
                .SetProperty(x => x.CashAmount, 80_000m));
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new SportHub.Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = 80_000m,
                Method = PaymentMethod.VnPay, Status = PaymentStatus.Success,
                ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var breakdown = await owner.GetFromJsonAsync<JsonElement>($"/api/members/me/invoices/{invoice.InvoiceId}/refund-breakdown");
        Assert.Equal(80_000m, breakdown.GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(20, breakdown.GetProperty("refundablePoints").GetInt32());
        Assert.Equal(20_000m, breakdown.GetProperty("pointsVnd").GetDecimal());

        using var form = Form(invoice.InvoiceId);
        var created = await owner.PostAsync("/api/support/requests", form);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();

        MultipartFormDataContent Payout(string amount, string points = "20")
        {
            var payout = new MultipartFormDataContent();
            payout.Add(new StringContent(amount), "Amount");
            payout.Add(new StringContent(points), "PointsRefunded");
            payout.Add(new StringContent("Called the member and refunded the VNPay share by transfer"), "Note");
            AddPng(payout);
            return payout;
        }
        // Each method has its own cap; a rejected attempt must not return points.
        using (var partial = Payout("90000"))
        {
            var res = await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", partial);
            Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
            Assert.Equal("payout_amount_exceeds_paid",
                (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
        Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets
            .Where(w => w.OwnerUserId == member.UserId).Select(w => w.AvailablePoints).SingleOrDefaultAsync()));

        using var exact = Payout("80000");
        var recorded = await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", exact);
        Assert.Equal(HttpStatusCode.OK, recorded.StatusCode);
        Assert.Equal(20, (await recorded.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("pointsRefunded").GetInt32());
        Assert.Equal(20, await factory.QueryAsync(db => db.PointWallets
            .Where(w => w.OwnerUserId == member.UserId).Select(w => w.AvailablePoints).SingleAsync()));
        using var again = Payout("80000");
        Assert.Equal(HttpStatusCode.Conflict,
            (await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", again)).StatusCode);
        Assert.Equal(20, await factory.QueryAsync(db => db.PointWallets
            .Where(w => w.OwnerUserId == member.UserId).Select(w => w.AvailablePoints).SingleAsync()));
        var after = await owner.GetFromJsonAsync<JsonElement>($"/api/members/me/invoices/{invoice.InvoiceId}/refund-breakdown");
        Assert.Equal(0m, after.GetProperty("refundableVnpayVnd").GetDecimal());
    }

    [Theory]
    [InlineData(80_000, 0)]
    [InlineData(80_000, 10)]
    [InlineData(0, 20)]
    [InlineData(40_000, 10)]
    public async Task Manager_can_record_cash_points_or_both_with_independent_caps(int cash, int points)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        await factory.QueryAsync(async db =>
        {
            var row = await db.Set<Invoice>().SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.CheckoutCycleId = Guid.NewGuid(); row.PointsApplied = 20; row.CashAmount = 80_000m;
            row.Status = InvoiceStatus.Paid;
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new() { PaymentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId, Amount = 80_000m, Method = PaymentMethod.VnPay,
                Status = PaymentStatus.Success, ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var request = Form(invoice.InvoiceId);
        var created = await owner.PostAsync("/api/support/requests", request);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        var endpoint = $"/api/member-support-requests/{requestId}/payout";
        MultipartFormDataContent Payout(string amount, string pointCount, bool proof = true)
        {
            var form = new MultipartFormDataContent();
            form.Add(new StringContent(amount), "Amount");
            form.Add(new StringContent(pointCount), "PointsRefunded");
            form.Add(new StringContent("Called member and approved this refund"), "Note");
            if (proof) AddPng(form);
            return form;
        }
        foreach (var (invalidCash, invalidPoints, status) in new[]
        {
            ("80500", "0", HttpStatusCode.BadRequest),
            ("80000", "20.5", HttpStatusCode.BadRequest),
            ("90000", "0", HttpStatusCode.Conflict),
            ("80000", "21", HttpStatusCode.Conflict),
            ("0", "0", HttpStatusCode.BadRequest)
        })
        {
            using var invalid = Payout(invalidCash, invalidPoints);
            Assert.Equal(status, (await mgr.PostAsync(endpoint, invalid)).StatusCode);
        }
        using var valid = Payout(cash.ToString(), points.ToString(), cash > 0);
        var recorded = await mgr.PostAsync(endpoint, valid);
        Assert.Equal(HttpStatusCode.OK, recorded.StatusCode);
        var result = await recorded.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(cash, result.GetProperty("amount").GetDecimal());
        Assert.Equal(points, result.GetProperty("pointsRefunded").GetInt32());
        Assert.Equal(points, await factory.QueryAsync(db => db.PointWallets
            .Where(w => w.OwnerUserId == member.UserId).Select(w => w.AvailablePoints).SingleOrDefaultAsync()));
        Assert.Equal(points, await factory.QueryAsync(db => db.Set<MemberSupportPayout>()
            .Where(p => p.RequestId == requestId).Select(p => p.PointsRefunded).SingleAsync()));
        Assert.Equal(points, await factory.QueryAsync(db => db.Set<SportHub.Payment.Wallet.Domain.PointLedgerEntry>()
            .Where(l => l.ReferenceId == requestId && l.ReferenceType == "SystemEvent" && l.Note!.StartsWith("SupportRefund:"))
            .SumAsync(l => (int?)l.Points)) ?? 0);
        var breakdown = await owner.GetFromJsonAsync<JsonElement>($"/api/members/me/invoices/{invoice.InvoiceId}/refund-breakdown");
        Assert.Equal(80_000m - cash, breakdown.GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(20 - points, breakdown.GetProperty("refundablePoints").GetInt32());
    }

    [Theory]
    [InlineData(100_000, 0)]
    [InlineData(0, 100)]
    [InlineData(40_000, 60)]
    [InlineData(0, 30)]
    public async Task Cash_paid_invoice_can_refund_cash_points_or_both_without_refunding_converted_value_again(int cash, int points)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        await factory.QueryAsync(async db =>
        {
            var row = await db.Set<Invoice>().SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.Status = InvoiceStatus.Paid;
            row.CashAmount = 100_000m;
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new() {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = 100_000m,
                Method = PaymentMethod.VnPay, Status = PaymentStatus.Success,
                ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var request = Form(invoice.InvoiceId);
        var created = await owner.PostAsync("/api/support/requests", request);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        var endpoint = $"/api/member-support-requests/{requestId}";
        var quote = (await mgr.GetFromJsonAsync<JsonElement>(endpoint + "/payout-quote")).GetProperty("items")[0];
        Assert.Equal(0, quote.GetProperty("refundablePoints").GetInt32());
        Assert.Equal(100, quote.GetProperty("maxRefundablePoints").GetInt32());
        MultipartFormDataContent Payout(int amount, int pointCount)
        {
            var form = new MultipartFormDataContent();
            form.Add(new StringContent(amount.ToString()), "Amount");
            form.Add(new StringContent(pointCount.ToString()), "PointsRefunded");
            form.Add(new StringContent("Called member and agreed refund in cash and points"), "Note");
            if (amount > 0) AddPng(form);
            return form;
        }
        using (var excessive = Payout(40_000, 61))
            Assert.Equal(HttpStatusCode.Conflict, (await mgr.PostAsync(endpoint + "/payout", excessive)).StatusCode);
        using var payout = Payout(cash, points);
        var recorded = await mgr.PostAsync(endpoint + "/payout", payout);
        Assert.Equal(HttpStatusCode.OK, recorded.StatusCode);
        Assert.Equal(points, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member.UserId)
            .Select(w => w.AvailablePoints).SingleOrDefaultAsync()));
        var breakdown = await owner.GetFromJsonAsync<JsonElement>($"/api/members/me/invoices/{invoice.InvoiceId}/refund-breakdown");
        var remaining = 100_000m - cash - points * 1000m;
        Assert.Equal(remaining, breakdown.GetProperty("refundableVnpayVnd").GetDecimal());
        Assert.Equal(remaining, breakdown.GetProperty("items")[0].GetProperty("refundableValueVnd").GetDecimal());
        using var duplicate = Payout(cash, points);
        Assert.Equal(HttpStatusCode.Conflict, (await mgr.PostAsync(endpoint + "/payout", duplicate)).StatusCode);
        var today = SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.TodayLocal(new SportHub.BuildingBlocks.SharedKernel.Time.SystemClock());
        var report = await mgr.GetFromJsonAsync<JsonElement>($"/api/reports/revenue?fromDate={today:yyyy-MM-dd}&toDate={today:yyyy-MM-dd}&memberId={member.UserId}");
        Assert.Equal(cash, report.GetProperty("bankRefundPaid").GetDecimal());
        // Every recorded payout counts once, including point-only and mixed refunds.
        Assert.Equal(1, report.GetProperty("bankRefundCount").GetInt32());
        Assert.Equal(points, report.GetProperty("pointsRefunded").GetInt64());
    }

    [Fact]
    public async Task Unreceived_report_prevents_auto_confirmation_even_if_a_legacy_request_is_closed_again()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 20_000m);
        var requestId = Guid.NewGuid();
        var payoutId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.Set<MemberSupportRequest>().Add(new MemberSupportRequest
            {
                RequestId = requestId, MemberId = member.UserId, RecordedByUserId = member.UserId,
                Category = "PAYMENT", Subject = "Payment help", Description = "Payment help",
                Status = "CLOSED", InvoiceId = invoice.InvoiceId, Channel = "ONLINE",
                CreatedAt = DateTime.UtcNow.AddDays(-91), SlaDueAtUtc = DateTime.UtcNow.AddDays(-89),
                ClosedAt = DateTime.UtcNow.AddDays(-91)
            });
            db.Set<MemberSupportPayout>().Add(new MemberSupportPayout
            {
                PayoutId = payoutId, RequestId = requestId, InvoiceId = invoice.InvoiceId,
                Amount = 10_000m, RecordedByUserId = manager.UserId,
                RecordedAtUtc = DateTime.UtcNow.AddDays(-4)
            });
            db.Set<MemberSupportAttachment>().AddRange(
                new MemberSupportAttachment
                {
                    AttachmentId = Guid.NewGuid(), RequestId = requestId,
                    Kind = SupportAttachmentKinds.MemberProof, FileName = "member.png",
                    ContentType = "image/png", Content = [1], CreatedAt = DateTime.UtcNow.AddDays(-91)
                },
                new MemberSupportAttachment
                {
                    AttachmentId = Guid.NewGuid(), RequestId = requestId, PayoutId = payoutId,
                    Kind = SupportAttachmentKinds.PayoutProof, FileName = "payout.png",
                    ContentType = "image/png", Content = [1], CreatedAt = DateTime.UtcNow.AddDays(-4)
                });
            await db.SaveChangesAsync();
            return 0;
        });
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.OK,
            (await owner.PostAsync($"/api/support/requests/{requestId}/report-not-received", null)).StatusCode);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<SupportPayoutMaintenance>().RunAsync(default);
        await factory.QueryAsync(async db =>
        {
            var request = await db.Set<MemberSupportRequest>().SingleAsync(x => x.RequestId == requestId);
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(x => x.RequestId == requestId);
            Assert.Equal("OPEN", request.Status);
            Assert.Null(payout.MemberConfirmedAtUtc);
            return 0;
        });
        await factory.QueryAsync(async db =>
        {
            await db.Set<MemberSupportRequest>().Where(x => x.RequestId == requestId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "CLOSED")
                    .SetProperty(x => x.ClosedAt, DateTime.UtcNow.AddDays(-91)));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<SupportPayoutMaintenance>().RunAsync(default);
        await factory.QueryAsync(async db =>
        {
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(x => x.RequestId == requestId);
            Assert.Null(payout.MemberConfirmedAtUtc);
            Assert.Null(payout.MemberConfirmedBy);
            Assert.Equal(2, await db.Set<MemberSupportAttachment>().CountAsync(x => x.RequestId == requestId));
            return 0;
        });
    }

    private async Task<(Guid RequestId, Guid PayoutId, Guid ProofId, DateTime RecordedAt)> SeedRecordedPayoutAsync(Guid memberId, Guid managerId)
    {
        var invoice = await factory.SeedInvoiceAsync(memberId, memberId, 50_000m);
        var requestId = Guid.NewGuid(); var payoutId = Guid.NewGuid(); var proofId = Guid.NewGuid();
        var recordedAt = DateTime.UtcNow.Date.AddDays(-4);
        await factory.QueryAsync(async db =>
        {
            db.Set<MemberSupportRequest>().Add(new()
            {
                RequestId = requestId, MemberId = memberId, RecordedByUserId = memberId,
                Category = "PAYMENT", Subject = "Transfer receipt review", Description = "Payment needs support",
                Status = "CLOSED", InvoiceId = invoice.InvoiceId, Channel = "ONLINE",
                CreatedAt = recordedAt, ClosedAt = recordedAt, SlaDueAtUtc = recordedAt.AddHours(48),
                ProgressNote = "Payout recorded."
            });
            db.Set<MemberSupportPayout>().Add(new()
            {
                PayoutId = payoutId, RequestId = requestId, InvoiceId = invoice.InvoiceId,
                Amount = 50_000m, Note = "Original transfer after calling the member.",
                RecordedByUserId = managerId, RecordedAtUtc = recordedAt
            });
            db.Set<MemberSupportAttachment>().Add(new()
            {
                AttachmentId = proofId, RequestId = requestId, PayoutId = payoutId,
                Kind = SupportAttachmentKinds.PayoutProof, FileName = "original-proof.png",
                ContentType = "image/png", Content = [137, 80, 78, 71], CreatedAt = recordedAt
            });
            await db.SaveChangesAsync(); return 0;
        });
        return (requestId, payoutId, proofId, recordedAt);
    }

    [Theory]
    [InlineData("done", "DONE")]
    [InlineData("reject", "REJECTED")]
    public async Task Manager_finalizes_reopened_payout_review_without_rewriting_or_confirming_the_transfer(string action, string status)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var outsider = await factory.SeedUserAsync(UserRole.Member);
        var recorded = await SeedRecordedPayoutAsync(member.UserId, manager.UserId);
        var id = recorded.RequestId;
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var receptionist = factory.CreateApiClient(desk.UserId, UserRole.Receptionist);
        using var other = factory.CreateApiClient(outsider.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PostAsync($"/api/support/requests/{id}/report-not-received", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/support/requests/{id}/report-not-received", null)).StatusCode);
        var endpoint = $"/api/member-support-requests/{id}/{action}";
        var notifications = await mgr.GetFromJsonAsync<JsonElement[]>("/api/notifications");
        var reportNotice = notifications!.Single(n => n.GetProperty("sourceEventType").GetString() == "SUPPORT_PAYOUT_NOT_RECEIVED"
            && n.GetProperty("message").GetString()!.Contains(id.ToString()));
        Assert.Equal($"/manager/requests?type=support&request={id}", reportNotice.GetProperty("actionUrl").GetString());
        var noticeSourceId = reportNotice.GetProperty("sourceEntityId").GetGuid();
        Assert.True(await factory.QueryAsync(db => db.Set<MemberSupportEvent>().AnyAsync(e => e.EventId == noticeSourceId
            && e.RequestId == id && e.Type == "MEMBER_REPORTED_NOT_RECEIVED")));
        const string reason = "Reviewed the original transfer with the bank and contacted the member. Outcome documented.";
        Assert.Equal(HttpStatusCode.Forbidden, (await receptionist.PostAsJsonAsync(endpoint, new { reason })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await mgr.PostAsJsonAsync(endpoint, new { reason = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await mgr.PostAsJsonAsync(endpoint, new { reason = new string('x', 1001) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await mgr.PostAsJsonAsync(endpoint, new { reason })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await mgr.PostAsJsonAsync(endpoint, new { reason })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsync($"/api/support/requests/{id}/report-not-received", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsync($"/api/support/requests/{id}/confirm-received", null)).StatusCode);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<SupportPayoutMaintenance>().AutoConfirmAsync(default);
        await factory.QueryAsync(async db =>
        {
            var request = await db.Set<MemberSupportRequest>().SingleAsync(r => r.RequestId == id);
            Assert.Equal(status, request.Status);
            Assert.Equal(reason, request.ProgressNote);
            Assert.Equal(manager.UserId, request.AssignedToUserId);
            Assert.NotNull(request.ClosedAt);
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(p => p.RequestId == id);
            Assert.Equal(recorded.PayoutId, payout.PayoutId);
            Assert.Equal(50_000m, payout.Amount);
            Assert.Equal(recorded.RecordedAt, payout.RecordedAtUtc);
            Assert.Equal("Original transfer after calling the member.", payout.Note);
            Assert.Null(payout.MemberConfirmedAtUtc); Assert.Null(payout.MemberConfirmedBy);
            Assert.Equal(1, await db.Set<MemberSupportAttachment>().CountAsync(a => a.PayoutId == payout.PayoutId));
            Assert.True(await db.Set<MemberSupportEvent>().AnyAsync(e => e.RequestId == id && e.Type == status
                && e.ActorUserId == manager.UserId && e.Note == reason));
            var audit = await db.Set<AuditLog>().SingleAsync(a => a.TargetId == id.ToString()
                && a.Action == (action == "done" ? "COMPLETE_SUPPORT_REQUEST" : "REJECT_SUPPORT_REQUEST")
                && a.UserId == manager.UserId);
            using var auditValue = JsonDocument.Parse(audit.NewValue!);
            Assert.Equal(reason, auditValue.RootElement.GetProperty("reason").GetString());
            return 0;
        });
        var mine = await owner.GetFromJsonAsync<JsonElement>("/api/support/requests/mine");
        var row = mine.EnumerateArray().Single(r => r.GetProperty("requestId").GetGuid() == id);
        Assert.Equal(status, row.GetProperty("status").GetString());
        Assert.Equal(reason, row.GetProperty("response").GetString());
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/support/attachments/{recorded.ProofId}")).StatusCode);
    }

    [Fact]
    public async Task Member_can_confirm_a_delayed_transfer_during_review_and_duplicate_reports_do_not_reset_assignment()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var recorded = await SeedRecordedPayoutAsync(member.UserId, manager.UserId);
        var id = recorded.RequestId;
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/support/requests/{id}/report-not-received", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await mgr.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = manager.UserId })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsync($"/api/support/requests/{id}/report-not-received", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(manager.UserId, await db.Set<MemberSupportRequest>().Where(r => r.RequestId == id).Select(r => r.AssignedToUserId).SingleAsync());
            return 0;
        });
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/support/requests/{id}/confirm-received", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            Assert.Equal("CLOSED", await db.Set<MemberSupportRequest>().Where(r => r.RequestId == id).Select(r => r.Status).SingleAsync());
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(p => p.RequestId == id);
            Assert.Equal("MEMBER", payout.MemberConfirmedBy); Assert.NotNull(payout.MemberConfirmedAtUtc);
            return 0;
        });
    }

    [Fact]
    public async Task Unreported_payout_still_auto_confirms_after_the_configured_wait()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var recorded = await SeedRecordedPayoutAsync(member.UserId, manager.UserId);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<SupportPayoutMaintenance>().AutoConfirmAsync(default);
        await factory.QueryAsync(async db =>
        {
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(p => p.PayoutId == recorded.PayoutId);
            Assert.Equal("SYSTEM", payout.MemberConfirmedBy);
            Assert.NotNull(payout.MemberConfirmedAtUtc);
            return 0;
        });
    }

    [Fact]
    public async Task Receptionist_creates_and_reminds_payment_requests_but_only_managers_are_notified()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 80_000m);
        await factory.QueryAsync(async db =>
        {
            db.Set<SportHub.Payment.Domain.Entities.Payment>().Add(new SportHub.Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = 80_000m,
                Method = PaymentMethod.VnPay, Status = PaymentStatus.Success,
                ReceivedByUserId = member.UserId, PaidAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using var desk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var missing = await desk.PostAsJsonAsync("/api/member-support-requests", new
        {
            memberId = member.UserId, category = "PAYMENT", description = "Charged but not activated"
        });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        var resolvedAtCounter = await desk.PostAsJsonAsync("/api/member-support-requests", new
        {
            memberId = member.UserId, category = "PAYMENT", description = "Charged but not activated",
            invoiceId = invoice.InvoiceId, resolveNote = "done"
        });
        Assert.Equal(HttpStatusCode.Forbidden, resolvedAtCounter.StatusCode);
        var created = await desk.PostAsJsonAsync("/api/member-support-requests", new
        {
            memberId = member.UserId, category = "PAYMENT", description = "Charged but not activated",
            invoiceId = invoice.InvoiceId, channel = "COUNTER"
        });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await desk.PostAsJsonAsync("/api/member-support-requests", new
        {
            memberId = member.UserId, category = "PAYMENT", description = "Again",
            invoiceId = invoice.InvoiceId
        })).StatusCode);

        // Too early: the response deadline has not passed.
        Assert.Equal(HttpStatusCode.Conflict,
            (await desk.PostAsync($"/api/member-support-requests/{requestId}/remind", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            await db.Set<MemberSupportRequest>().Where(x => x.RequestId == requestId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.SlaDueAtUtc, DateTime.UtcNow.AddHours(-1)));
            return 0;
        });
        Assert.Equal(HttpStatusCode.OK,
            (await desk.PostAsync($"/api/member-support-requests/{requestId}/remind", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            var targets = await db.Set<MemberSupportEvent>()
                .Where(e => e.RequestId == requestId && e.Type == "REMINDED_BY_STAFF")
                .Select(e => e.TargetUserId).ToListAsync();
            Assert.Contains(manager.UserId, targets);
            Assert.DoesNotContain(receptionist.UserId, targets);
            return 0;
        });
        // The member shares the same cooldown, so an immediate member reminder is refused.
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Conflict,
            (await owner.PostAsync($"/api/support/requests/{requestId}/remind", null)).StatusCode);
    }
}
