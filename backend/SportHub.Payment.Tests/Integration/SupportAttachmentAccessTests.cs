using System.Net;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

public sealed class SupportAttachmentAccessTests(PaymentApiFactory factory) : IClassFixture<PaymentApiFactory>
{
    [Fact]
    public async Task PayoutProofIsHiddenFromReceptionistAndOtherMembers()
    {
        var owner = await factory.SeedUserAsync(UserRole.Member);
        var outsider = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var now = DateTime.UtcNow;
        var requestId = Guid.NewGuid();
        var payoutId = Guid.NewGuid();
        var memberProofId = Guid.NewGuid();
        var payoutProofId = Guid.NewGuid();
        var invoice = await factory.SeedInvoiceAsync(owner.UserId, owner.UserId, 100_000m);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<MemberSupportRequest>().Add(new MemberSupportRequest
            {
                RequestId = requestId, MemberId = owner.UserId, RecordedByUserId = owner.UserId,
                Category = "PAYMENT", Subject = "Payment help", Description = "Payment help",
                Status = "DONE", Channel = "ONLINE", CreatedAt = now, SlaDueAtUtc = now.AddHours(48),
                InvoiceId = invoice.InvoiceId
            });
            db.Set<MemberSupportPayout>().Add(new MemberSupportPayout
            {
                PayoutId = payoutId, RequestId = requestId, InvoiceId = invoice.InvoiceId,
                Amount = 50_000m, RecordedByUserId = manager.UserId, RecordedAtUtc = now
            });
            db.Set<MemberSupportAttachment>().AddRange(
                new MemberSupportAttachment
                {
                    AttachmentId = memberProofId, RequestId = requestId, Kind = SupportAttachmentKinds.MemberProof,
                    FileName = "member.png", ContentType = "image/png", Content = [1, 2, 3], CreatedAt = now
                },
                new MemberSupportAttachment
                {
                    AttachmentId = payoutProofId, RequestId = requestId, PayoutId = payoutId,
                    Kind = SupportAttachmentKinds.PayoutProof,
                    FileName = "payout.png", ContentType = "image/png", Content = [1, 2, 3], CreatedAt = now
                });
            await db.SaveChangesAsync();
        }

        using var ownerClient = factory.CreateApiClient(owner.UserId, UserRole.Member);
        using var outsiderClient = factory.CreateApiClient(outsider.UserId, UserRole.Member);
        using var receptionistClient = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        using var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        Assert.Equal(HttpStatusCode.OK, (await ownerClient.GetAsync($"/api/support/attachments/{payoutProofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await managerClient.GetAsync($"/api/support/attachments/{payoutProofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await receptionistClient.GetAsync($"/api/support/attachments/{payoutProofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderClient.GetAsync($"/api/support/attachments/{payoutProofId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await receptionistClient.GetAsync($"/api/support/attachments/{memberProofId}")).StatusCode);

        var deskDetail = await receptionistClient.GetStringAsync($"/api/member-support-requests/{requestId}");
        var managerDetail = await managerClient.GetStringAsync($"/api/member-support-requests/{requestId}");
        Assert.Contains(memberProofId.ToString(), deskDetail);
        Assert.DoesNotContain(payoutProofId.ToString(), deskDetail);
        Assert.Contains(payoutProofId.ToString(), managerDetail);
    }
}
