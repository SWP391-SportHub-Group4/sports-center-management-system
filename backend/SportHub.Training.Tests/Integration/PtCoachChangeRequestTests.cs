using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class PtCoachChangeRequestTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Member_creates_request_for_active_personal_trainer()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var oldCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var newCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, oldCoach.UserId);
        var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        var response = await RequestAsync(client, entitlement.EntitlementId, newCoach.UserId);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PtCoachChangeRequestResponse>();
        Assert.NotNull(body);
        Assert.Equal(member.UserId, body.MemberId);
        Assert.Equal(oldCoach.UserId, body.CurrentCoachId);
        Assert.Equal(newCoach.UserId, body.RequestedCoachId);
        Assert.Equal("Pending", body.Status);
    }

    [Fact]
    public async Task Member_cannot_request_change_for_another_members_entitlement()
    {
        var owner = await factory.SeedUserAsync(UserRole.Member);
        var otherMember = await factory.SeedUserAsync(UserRole.Member);
        var oldCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var newCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var entitlement = await factory.SeedPtEntitlementAsync(owner.UserId, oldCoach.UserId);
        var client = factory.CreateApiClient(otherMember.UserId, UserRole.Member);

        var response = await RequestAsync(client, entitlement.EntitlementId, newCoach.UserId);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("pt_entitlement_not_owned", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Requested_coach_must_be_an_active_personal_trainer()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var oldCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var instructor = await factory.SeedCoachAsync(CoachCategory.ClassInstructor);
        var inactivePt = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer, UserStatus.Deactivated);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, oldCoach.UserId);
        var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        var instructorResponse = await RequestAsync(client, entitlement.EntitlementId, instructor.UserId);
        Assert.Equal(HttpStatusCode.BadRequest, instructorResponse.StatusCode);
        Assert.Contains("coach_must_be_personal_trainer", await instructorResponse.Content.ReadAsStringAsync());

        var inactiveResponse = await RequestAsync(client, entitlement.EntitlementId, inactivePt.UserId);
        Assert.Equal(HttpStatusCode.BadRequest, inactiveResponse.StatusCode);
        Assert.Contains("coach_must_be_personal_trainer", await inactiveResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Entitlement_allows_only_one_pending_coach_change_request()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var oldCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var firstCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var secondCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, oldCoach.UserId);
        var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        Assert.Equal(
            HttpStatusCode.Created,
            (await RequestAsync(client, entitlement.EntitlementId, firstCoach.UserId)).StatusCode);

        var duplicate = await RequestAsync(client, entitlement.EntitlementId, secondCoach.UserId);

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains("pt_coach_change_already_pending", await duplicate.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Manager_approval_changes_entitlement_relationship_and_only_non_conflicting_future_sessions()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var conflictMember = await factory.SeedUserAsync(UserRole.Member);
        var oldCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var newCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var entitlement = await factory.SeedPtEntitlementAsync(
            member.UserId, oldCoach.UserId, totalQuota: 8, reservedSessions: 2, consumedSessions: 1);
        var conflictEntitlement = await factory.SeedPtEntitlementAsync(
            conflictMember.UserId, newCoach.UserId, totalQuota: 8, reservedSessions: 1);
        var firstStart = FutureStart(days: 10);
        var secondStart = FutureStart(days: 12);

        var movedSessionId = Guid.NewGuid();
        var unmovedSessionId = Guid.NewGuid();
        var pastSessionId = Guid.NewGuid();

        await factory.ExecuteAsync(async db =>
        {
            db.CoachMemberRelationships.Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                MemberId = member.UserId,
                CoachId = oldCoach.UserId,
                SourceType = RelationshipSourceType.Personal,
                Status = RelationshipStatus.Active,
                StartedAt = DateTime.UtcNow.AddDays(-20)
            });

            db.PtSessions.AddRange(
                Session(movedSessionId, entitlement, manager.UserId, firstStart),
                Session(unmovedSessionId, entitlement, manager.UserId, secondStart),
                Session(
                    pastSessionId,
                    entitlement,
                    manager.UserId,
                    DateTime.UtcNow.AddDays(-2),
                    PtSessionStatus.Completed,
                    PtSessionQuotaState.Consumed),
                Session(Guid.NewGuid(), conflictEntitlement, manager.UserId, secondStart));

            await db.SaveChangesAsync();
        });

        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var requestResponse = await RequestAsync(memberClient, entitlement.EntitlementId, newCoach.UserId);
        var request = await requestResponse.Content.ReadFromJsonAsync<PtCoachChangeRequestResponse>();

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var approveResponse = await managerClient.PostAsJsonAsync(
            $"api/manager/pt-coach-change-requests/{request!.RequestId}/approve",
            new ReviewPtCoachChangeRequest { ReviewNote = "Coach mới đã xác nhận lịch." });

        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);
        var approved = await approveResponse.Content.ReadFromJsonAsync<PtCoachChangeApprovalResponse>();
        Assert.NotNull(approved);
        Assert.Equal("Approved", approved.Request.Status);
        Assert.Equal(new[] { movedSessionId }, approved.MovedSessionIds);
        Assert.Equal(new[] { unmovedSessionId }, approved.UnmovedSessionIds);

        var reloadedEntitlement = await factory.QueryAsync(
            db => db.PtEntitlements.SingleAsync(e => e.EntitlementId == entitlement.EntitlementId));
        Assert.Equal(newCoach.UserId, reloadedEntitlement.CoachId);

        var sessions = await factory.QueryAsync(db => db.PtSessions
            .Where(s => s.EntitlementId == entitlement.EntitlementId)
            .ToDictionaryAsync(s => s.SessionId));
        Assert.Equal(newCoach.UserId, sessions[movedSessionId].CoachId);
        Assert.Equal(oldCoach.UserId, sessions[unmovedSessionId].CoachId);
        Assert.Equal(oldCoach.UserId, sessions[pastSessionId].CoachId);

        var relationships = await factory.QueryAsync(db => db.CoachMemberRelationships
            .Where(r => r.MemberId == member.UserId)
            .ToListAsync());
        Assert.Contains(
            relationships,
            r => r.CoachId == oldCoach.UserId && r.Status == RelationshipStatus.Ended);
        Assert.Contains(
            relationships,
            r => r.CoachId == newCoach.UserId && r.Status == RelationshipStatus.Active);
    }

    [Fact]
    public async Task Manager_rejection_keeps_entitlement_and_sessions_unchanged()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var oldCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var newCoach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, oldCoach.UserId);
        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var requestResponse = await RequestAsync(memberClient, entitlement.EntitlementId, newCoach.UserId);
        var request = await requestResponse.Content.ReadFromJsonAsync<PtCoachChangeRequestResponse>();
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var rejectResponse = await managerClient.PostAsJsonAsync(
            $"api/manager/pt-coach-change-requests/{request!.RequestId}/reject",
            new ReviewPtCoachChangeRequest { ReviewNote = "Coach mới chưa thể nhận thêm học viên." });

        Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        var rejected = await rejectResponse.Content.ReadFromJsonAsync<PtCoachChangeRequestResponse>();
        Assert.Equal("Rejected", rejected!.Status);

        var reloaded = await factory.QueryAsync(
            db => db.PtEntitlements.SingleAsync(e => e.EntitlementId == entitlement.EntitlementId));
        Assert.Equal(oldCoach.UserId, reloaded.CoachId);
    }

    [Theory]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Non_manager_roles_cannot_review_coach_change_requests(UserRole role)
    {
        var actor = role == UserRole.Coach
            ? await factory.SeedCoachAsync(CoachCategory.PersonalTrainer)
            : await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(actor.UserId, role);

        var response = await client.PostAsJsonAsync(
            $"api/manager/pt-coach-change-requests/{Guid.NewGuid()}/approve",
            new ReviewPtCoachChangeRequest());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static Task<HttpResponseMessage> RequestAsync(
        HttpClient client,
        Guid entitlementId,
        Guid requestedCoachId)
        => client.PostAsJsonAsync(
            $"api/members/me/pt-entitlements/{entitlementId}/coach-change-requests",
            new RequestPtCoachChangeRequest
            {
                RequestedCoachId = requestedCoachId,
                Reason = "Muốn đổi Coach phù hợp lịch cá nhân hơn."
            });

    private static PtSession Session(
        Guid sessionId,
        PtEntitlement entitlement,
        Guid managerId,
        DateTime startAtUtc,
        PtSessionStatus status = PtSessionStatus.Scheduled,
        PtSessionQuotaState quotaState = PtSessionQuotaState.Reserved)
        => new()
        {
            SessionId = sessionId,
            EntitlementId = entitlement.EntitlementId,
            MemberId = entitlement.MemberId,
            CoachId = entitlement.CoachId,
            StartAtUtc = startAtUtc,
            EndAtUtc = startAtUtc.AddMinutes(90),
            Status = status,
            QuotaState = quotaState,
            CreatedByUserId = managerId,
            CompletedAt = status == PtSessionStatus.Completed ? startAtUtc.AddMinutes(90) : null
        };

    private static DateTime FutureStart(int days)
        => DateTime.SpecifyKind(DateTime.UtcNow.Date.AddDays(days).AddHours(8), DateTimeKind.Utc);
}
