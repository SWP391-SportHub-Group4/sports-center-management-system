using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ManagerRequestReadTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Unread_is_persistent_idempotent_and_isolated_per_manager_for_all_request_types()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var other = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var session = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        using var second = factory.CreateApiClient(other.UserId, UserRole.CenterManager);
        using var coach = factory.CreateApiClient(course.CoachId, UserRole.Coach);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        async Task<int> Unread(HttpClient client) => (await client.GetFromJsonAsync<JsonElement>("api/manager/requests/summary")).GetProperty("unread").GetInt32();
        var baseline = await Unread(manager);
        var requestId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{session.SessionId}/change-requests",
            new CreateClassChangeRequest(requestId, "ABSENCE", "Cannot teach this session"))).StatusCode);
        var supportId = Guid.NewGuid();
        var refundId = Guid.NewGuid();
        await factory.QueryAsync(async db => {
            foreach (var status in new[] { "OPEN", "DONE", "REJECTED", "CLOSED" })
                db.MemberSupportRequests.Add(new MemberSupportRequest { RequestId = status == "OPEN" ? supportId : Guid.NewGuid(),
                    MemberId = member.UserId, RecordedByUserId = member.UserId, Category = "CLASS", Subject = "Coach support",
                    Description = "Please review my coach", Status = status, CreatedAt = DateTime.UtcNow });
            var invoice = new Invoice { InvoiceId = Guid.NewGuid(), InvoiceNumber = "READ-" + Guid.NewGuid(), MemberId = member.UserId,
                IssuedByUserId = course.ManagerId, TotalAmount = 100000, IssuedAt = DateTime.UtcNow };
            db.Invoices.Add(invoice);
            db.PaymentAdjustments.Add(new PaymentAdjustment { AdjustmentId = refundId, InvoiceId = invoice.InvoiceId,
                Type = PaymentAdjustmentType.Refund, Status = PaymentAdjustmentStatus.Requested, Amount = 1000, RequestedAmount = 1000,
                Reason = "Refund request", RequestedByUserId = member.UserId, CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        Assert.Equal(baseline + 3, await Unread(manager));
        var otherBaseline = await Unread(second);
        foreach (var (type, id) in new[] { ("coach", requestId), ("support", supportId), ("refunds", refundId) })
        {
            var before = await Unread(manager);
            Assert.Equal(HttpStatusCode.NoContent, (await manager.PostAsync($"api/manager/requests/{type}/{id}/read", null)).StatusCode);
            Assert.Equal(before - 1, await Unread(manager));
            Assert.Equal(HttpStatusCode.NoContent, (await manager.PostAsync($"api/manager/requests/{type}/{id}/read", null)).StatusCode);
            Assert.Equal(before - 1, await Unread(manager));
        }
        Assert.Equal(otherBaseline, await Unread(second));
        Assert.Equal(baseline, await Unread(manager));
        Assert.Equal(3, await factory.QueryAsync(db => db.Set<ManagerRequestReadReceipt>().CountAsync(r => r.ManagerId == course.ManagerId)));
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsync($"api/manager/requests/support/{supportId}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await manager.PostAsync($"api/manager/requests/support/{Guid.NewGuid()}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await manager.PostAsync($"api/manager/requests/unknown/{supportId}/read", null)).StatusCode);
    }
}
