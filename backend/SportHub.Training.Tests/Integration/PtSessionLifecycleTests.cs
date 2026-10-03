using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// BE-4 Phase 3 — entitlement/quota/session lifecycle: booking, conflict, cancel/reschedule
/// (on-time/late), complete/no-show, change-request request/approve/reject, và RBAC.
/// </summary>
[Collection(nameof(TrainingApiCollection))]
public sealed class PtSessionLifecycleTests(TrainingApiFactory factory)
{
    private static DateTime NextMondayNoonUtc(int weekOffset = 1)
    {
        var today = DateTime.UtcNow.Date;
        var daysUntilMonday = ((int)DayOfWeek.Monday - (int)today.DayOfWeek + 7) % 7;
        return today.AddDays(daysUntilMonday + (7 * weekOffset)).AddHours(12);
    }

    [Fact]
    public async Task Manager_books_a_pt_session_and_reserves_quota()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var startAtUtc = NextMondayNoonUtc();

        var response = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = startAtUtc });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var session = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.NotNull(session);
        Assert.Equal("Scheduled", session!.Status);
        Assert.Equal("Reserved", session.QuotaState);
        Assert.Equal(startAtUtc, session.StartAtUtc);
        Assert.Equal(startAtUtc.AddMinutes(90), session.EndAtUtc);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(1, reloaded!.ReservedSessions);
    }

    [Fact]
    public async Task Booking_against_exhausted_entitlement_is_rejected()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(
            member.UserId, coach.UserId, totalQuota: 4, consumedSessions: 4);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = NextMondayNoonUtc() });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("pt_quota_exhausted", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Booking_outside_membership_validity_is_rejected()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(
            member.UserId,
            coach.UserId,
            validityStartDate: DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-10),
            validityEndDate: DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1));
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = NextMondayNoonUtc() });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("pt_session_outside_membership_validity", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Coach_cannot_be_double_booked_across_two_entitlements()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var memberA = await factory.SeedUserAsync(UserRole.Member);
        var memberB = await factory.SeedUserAsync(UserRole.Member);
        var entitlementA = await factory.SeedPtEntitlementAsync(memberA.UserId, coach.UserId);
        var entitlementB = await factory.SeedPtEntitlementAsync(memberB.UserId, coach.UserId);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var startAtUtc = NextMondayNoonUtc();

        var first = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlementA.EntitlementId, StartAtUtc = startAtUtc });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlementB.EntitlementId, StartAtUtc = startAtUtc.AddMinutes(30) });

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("pt_coach_conflict", await second.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Member_cannot_be_double_booked_across_two_coaches()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coachA = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var coachB = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlementA = await factory.SeedPtEntitlementAsync(member.UserId, coachA.UserId);
        var entitlementB = await factory.SeedPtEntitlementAsync(member.UserId, coachB.UserId);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var startAtUtc = NextMondayNoonUtc();

        var first = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlementA.EntitlementId, StartAtUtc = startAtUtc });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlementB.EntitlementId, StartAtUtc = startAtUtc.AddMinutes(30) });

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("pt_member_conflict", await second.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Sessions_touching_at_the_boundary_are_allowed()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var startAtUtc = NextMondayNoonUtc();

        var first = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = startAtUtc });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        // Buổi B bắt đầu đúng lúc buổi A kết thúc (+90') — không tính là giao nhau.
        var second = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = startAtUtc.AddMinutes(90) });

        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
    }

    [Fact]
    public async Task Coach_completes_own_session_and_consumes_quota_idempotently()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc());
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await coachClient.PostAsync($"api/coaches/me/pt-sessions/{session.SessionId}/complete", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var completed = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal("Completed", completed!.Status);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(0, reloaded!.ReservedSessions);
        Assert.Equal(1, reloaded.ConsumedSessions);

        // Gọi lại lần hai — idempotent, không được consume thêm lần nữa.
        var retry = await coachClient.PostAsync($"api/coaches/me/pt-sessions/{session.SessionId}/complete", null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);

        var reloadedAgain = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(1, reloadedAgain!.ConsumedSessions);
    }

    [Fact]
    public async Task Entitlement_becomes_exhausted_when_last_quota_is_consumed()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 1);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc());
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        await coachClient.PostAsync($"api/coaches/me/pt-sessions/{session.SessionId}/complete", null);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal("Exhausted", reloaded!.Status.ToString());
    }

    [Fact]
    public async Task Coach_cannot_complete_another_coachs_session()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var otherCoach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc());
        var otherCoachClient = factory.CreateApiClient(otherCoach.UserId, UserRole.Coach);

        var response = await otherCoachClient.PostAsync(
            $"api/coaches/me/pt-sessions/{session.SessionId}/complete", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Coach_without_pt_specialty_can_read_only_owned_assignments_and_cannot_complete()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var classInstructor = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc());
        var classInstructorClient = factory.CreateApiClient(classInstructor.UserId, UserRole.Coach);

        var response = await classInstructorClient.GetAsync("api/coaches/me/pt-sessions");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadApiJsonAsync<List<PtSessionResponse>>())!);
        Assert.Equal(HttpStatusCode.Forbidden, (await classInstructorClient.PostAsync(
            $"api/coaches/me/pt-sessions/{session.SessionId}/complete", null)).StatusCode);
    }

    [Fact]
    public async Task Coach_records_no_show_and_consumes_quota()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc());
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await coachClient.PostAsJsonAsync(
            $"api/coaches/me/pt-sessions/{session.SessionId}/no-show",
            new NoShowPtSessionRequest { Reason = "Không tới, không báo trước." });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var noShow = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal("NoShow", noShow!.Status);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(1, reloaded!.ConsumedSessions);
    }

    [Fact]
    public async Task Manager_cancel_on_time_releases_quota()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        // > 24h trong tương lai nên chắc chắn là on-time dù test chạy lúc nào.
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc(weekOffset: 2));
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            $"api/manager/pt-sessions/{session.SessionId}/cancel",
            new ManagerCancelPtSessionRequest { Reason = "Coach nghỉ đột xuất." });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal("CancelledOnTime", cancelled!.Status);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(0, reloaded!.ReservedSessions);
        Assert.Equal(0, reloaded.ConsumedSessions);
    }

    [Fact]
    public async Task Manager_cancel_late_consumes_quota()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        // Trong vòng chưa tới 24h kể từ bây giờ -> chắc chắn Late.
        var session = await CreateSessionAsync(manager, entitlement, DateTime.UtcNow.AddHours(2));
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            $"api/manager/pt-sessions/{session.SessionId}/cancel",
            new ManagerCancelPtSessionRequest { Reason = "Hủy sát giờ." });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal("CancelledLate", cancelled!.Status);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(0, reloaded!.ReservedSessions);
        Assert.Equal(1, reloaded.ConsumedSessions);
    }

    [Fact]
    public async Task Manager_reschedule_on_time_keeps_net_quota_unchanged()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc(weekOffset: 2));
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var newStart = session.StartAtUtc.AddDays(1);

        var response = await client.PostAsJsonAsync(
            $"api/manager/pt-sessions/{session.SessionId}/reschedule",
            new ManagerReschedulePtSessionRequest { NewStartAtUtc = newStart, Reason = "Đổi lịch theo yêu cầu." });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var replacement = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal("Scheduled", replacement!.Status);
        Assert.Equal(session.SessionId, replacement.RescheduledFromSessionId);

        var oldSession = await factory.QueryAsync(db => db.PtSessions.FindAsync(session.SessionId).AsTask());
        Assert.Equal(PtSessionStatus.RescheduledOnTime, oldSession!.Status);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(1, reloaded!.ReservedSessions);
        Assert.Equal(0, reloaded.ConsumedSessions);
    }

    [Fact]
    public async Task Manager_reschedule_late_without_remaining_quota_is_rejected_and_leaves_old_session_untouched()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        // TotalQuota=1: sau khi buổi này giữ 1 reserved thì hết quota, late reschedule cần thêm 1
        // suất không còn -> phải bị từ chối, session cũ giữ nguyên Scheduled.
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 1);
        var session = await CreateSessionAsync(manager, entitlement, DateTime.UtcNow.AddHours(2));
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            $"api/manager/pt-sessions/{session.SessionId}/reschedule",
            new ManagerReschedulePtSessionRequest
            {
                NewStartAtUtc = session.StartAtUtc.AddDays(1), Reason = "Đổi lịch trễ hạn."
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("pt_quota_exhausted", await response.Content.ReadAsStringAsync());

        var oldSession = await factory.QueryAsync(db => db.PtSessions.FindAsync(session.SessionId).AsTask());
        Assert.Equal(PtSessionStatus.Scheduled, oldSession!.Status);
    }

    [Fact]
    public async Task Member_requests_cancel_and_manager_approval_applies_stored_timing()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        // On-time tại lúc GỬI yêu cầu (đủ xa deadline 24h).
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc(weekOffset: 2));
        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);

        var requestResponse = await memberClient.PostAsJsonAsync(
            $"api/members/me/pt-sessions/{session.SessionId}/change-requests",
            new RequestPtSessionChangeRequest { RequestType = "Cancel", Reason = "Bận đột xuất." });

        Assert.Equal(HttpStatusCode.Created, requestResponse.StatusCode);
        var changeRequest = await requestResponse.Content.ReadApiJsonAsync<PtSessionChangeRequestResponse>();
        Assert.Equal("OnTime", changeRequest!.TimingClassification);
        Assert.Equal("Pending", changeRequest.Status);

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var approveResponse = await managerClient.PostAsJsonAsync(
            $"api/manager/pt-session-change-requests/{changeRequest.RequestId}/approve",
            new ReviewPtSessionChangeRequest { ReviewNote = "Đồng ý." });

        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);
        var approved = await approveResponse.Content.ReadApiJsonAsync<PtSessionChangeRequestResponse>();
        Assert.Equal("Approved", approved!.Status);

        var cancelledSession = await factory.QueryAsync(db => db.PtSessions.FindAsync(session.SessionId).AsTask());
        Assert.Equal(PtSessionStatus.CancelledOnTime, cancelledSession!.Status);

        var reloaded = await factory.QueryAsync(db => db.PtEntitlements.FindAsync(entitlement.EntitlementId).AsTask());
        Assert.Equal(0, reloaded!.ReservedSessions);
        Assert.Equal(0, reloaded.ConsumedSessions);
    }

    [Fact]
    public async Task Manager_rejects_change_request_and_session_stays_scheduled()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc(weekOffset: 2));
        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);

        var requestResponse = await memberClient.PostAsJsonAsync(
            $"api/members/me/pt-sessions/{session.SessionId}/change-requests",
            new RequestPtSessionChangeRequest { RequestType = "Cancel", Reason = "Muốn hủy." });
        var changeRequest = await requestResponse.Content.ReadApiJsonAsync<PtSessionChangeRequestResponse>();

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var rejectResponse = await managerClient.PostAsJsonAsync(
            $"api/manager/pt-session-change-requests/{changeRequest!.RequestId}/reject",
            new ReviewPtSessionChangeRequest { ReviewNote = "Buổi đã sát giờ, không thể hủy." });

        Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        var rejected = await rejectResponse.Content.ReadApiJsonAsync<PtSessionChangeRequestResponse>();
        Assert.Equal("Rejected", rejected!.Status);

        var stillScheduled = await factory.QueryAsync(db => db.PtSessions.FindAsync(session.SessionId).AsTask());
        Assert.Equal(PtSessionStatus.Scheduled, stillScheduled!.Status);
    }

    [Fact]
    public async Task Second_pending_change_request_for_the_same_session_is_rejected()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 8);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc(weekOffset: 2));
        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var body = new RequestPtSessionChangeRequest { RequestType = "Cancel", Reason = "Bận." };

        var first = await memberClient.PostAsJsonAsync(
            $"api/members/me/pt-sessions/{session.SessionId}/change-requests", body);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await memberClient.PostAsJsonAsync(
            $"api/members/me/pt-sessions/{session.SessionId}/change-requests", body);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("pt_change_request_already_pending", await second.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Member_cannot_request_change_for_another_members_session()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var otherMember = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var session = await CreateSessionAsync(manager, entitlement, NextMondayNoonUtc(weekOffset: 2));
        var otherMemberClient = factory.CreateApiClient(otherMember.UserId, UserRole.Member);

        var response = await otherMemberClient.PostAsJsonAsync(
            $"api/members/me/pt-sessions/{session.SessionId}/change-requests",
            new RequestPtSessionChangeRequest { RequestType = "Cancel", Reason = "Không phải của tôi." });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Receptionist)]
    public async Task Non_manager_roles_cannot_create_pt_sessions(UserRole role)
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var actor = await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(actor.UserId, role);

        var response = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = NextMondayNoonUtc() });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Endpoints_require_authentication()
    {
        var client = factory.CreateApiClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/manager/pt-sessions")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/members/me/pt-sessions")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/coaches/me/pt-sessions")).StatusCode);
    }

    private async Task<PtSessionResponse> CreateSessionAsync(
        SportHub.Identity.Domain.Entities.UserAccount manager, PtEntitlement entitlement, DateTime startAtUtc)
    {
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            "api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = startAtUtc });

        response.EnsureSuccessStatusCode();

        return (await response.Content.ReadApiJsonAsync<PtSessionResponse>())!;
    }
}
