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
    private static MultipartFormDataContent Form(Guid invoiceId, int proofs = 1)
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent("PAYMENT"), "Category");
        form.Add(new StringContent("Captured payment needs support"), "Description");
        form.Add(new StringContent(invoiceId.ToString()), "InvoiceId");
        form.Add(new StringContent("Test Bank"), "BankName");
        form.Add(new StringContent("12345678"), "AccountNumber");
        form.Add(new StringContent("Test Member"), "AccountHolder");
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
        using (var missingBank = new MultipartFormDataContent())
        {
            missingBank.Add(new StringContent("PAYMENT"), "Category");
            missingBank.Add(new StringContent("Captured payment needs support"), "Description");
            missingBank.Add(new StringContent(invoice.InvoiceId.ToString()), "InvoiceId");
            AddPng(missingBank);
            var res = await owner.PostAsync("/api/support/requests", missingBank);
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            Assert.Equal("payment_request_bank_required",
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
        await factory.QueryAsync(async db =>
        {
            var bank = await db.Set<MemberSupportPayoutDetail>().SingleAsync(x => x.RequestId == requestId);
            Assert.DoesNotContain("12345678", bank.AccountNumberEncrypted);
            Assert.Equal("5678", bank.AccountLast4);
            return 0;
        });
        Assert.Equal(HttpStatusCode.Forbidden,
            (await desk.PostAsync($"/api/member-support-requests/{requestId}/payout", new MultipartFormDataContent())).StatusCode);
        using (var noPayoutProof = new MultipartFormDataContent())
        {
            noPayoutProof.Add(new StringContent("50000"), "Amount");
            Assert.Equal(HttpStatusCode.BadRequest,
                (await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", noPayoutProof)).StatusCode);
        }
        using (var excessive = new MultipartFormDataContent())
        {
            excessive.Add(new StringContent("100001"), "Amount");
            AddPng(excessive);
            var res = await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", excessive);
            Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        }
        var today = DateOnly.FromDateTime(SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(DateTime.UtcNow));
        var reportUrl = $"/api/reports/revenue?fromDate={today.AddDays(-1):yyyy-MM-dd}&toDate={today.AddDays(1):yyyy-MM-dd}";
        var before = await mgr.GetFromJsonAsync<JsonElement>(reportUrl);
        using var payoutForm = new MultipartFormDataContent();
        payoutForm.Add(new StringContent("50000"), "Amount");
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
        Assert.Equal(HttpStatusCode.Forbidden,
            (await desk.GetAsync($"/api/member-support-requests/{requestId}/bank-details")).StatusCode);
        var managerBank = await mgr.GetFromJsonAsync<JsonElement>(
            $"/api/member-support-requests/{requestId}/bank-details");
        Assert.Equal("12345678", managerBank.GetProperty("accountNumber").GetString());
        await factory.QueryAsync(async db =>
        {
            var audit = await db.Set<AuditLog>().SingleAsync(x => x.Action == "SUPPORT_PAYOUT_RECORDED"
                && x.TargetId == payoutJson.GetProperty("payoutId").GetGuid().ToString());
            Assert.DoesNotContain("12345678", audit.NewValue);
            Assert.Contains("5678", audit.NewValue);
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
        AddPng(repeat);
        Assert.Equal(HttpStatusCode.Conflict,
            (await mgr.PostAsync($"/api/member-support-requests/{requestId}/payout", repeat)).StatusCode);
        var mine = await owner.GetFromJsonAsync<JsonElement>("/api/support/requests/mine");
        var row = mine.EnumerateArray().Single(x => x.GetProperty("requestId").GetGuid() == requestId);
        Assert.Equal(50_000m, row.GetProperty("payout").GetProperty("amount").GetDecimal());
        Assert.Contains(proofId.ToString(), row.GetProperty("payout").GetProperty("proofAttachmentIds").ToString());
        Assert.Equal("••••5678", row.GetProperty("bankAccountMasked").GetString());
        Assert.Equal(HttpStatusCode.OK,
            (await owner.PostAsync($"/api/support/requests/{requestId}/confirm-received", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await owner.PostAsync($"/api/support/requests/{requestId}/report-not-received", null)).StatusCode);
    }

    [Fact]
    public async Task Unreceived_report_reopens_request_and_maintenance_confirms_or_purges_only_when_due()
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
            db.Set<MemberSupportPayoutDetail>().Add(new MemberSupportPayoutDetail
            {
                RequestId = requestId, BankName = "Test Bank", AccountNumberEncrypted = "protected",
                AccountLast4 = "5678", AccountHolder = "Test Member"
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
            var detail = await db.Set<MemberSupportPayoutDetail>().SingleAsync(x => x.RequestId == requestId);
            var payout = await db.Set<MemberSupportPayout>().SingleAsync(x => x.RequestId == requestId);
            Assert.Null(detail.AccountNumberEncrypted);
            Assert.Null(detail.AccountHolder);
            Assert.Null(detail.BankName);
            Assert.NotNull(detail.PurgedAtUtc);
            Assert.Equal("SYSTEM", payout.MemberConfirmedBy);
            Assert.Equal(2, await db.Set<MemberSupportAttachment>().CountAsync(x => x.RequestId == requestId));
            return 0;
        });
    }
}
