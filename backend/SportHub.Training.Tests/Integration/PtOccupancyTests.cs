using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Services;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class PtOccupancyTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Incident_preview_requires_pt_resolution_and_center_cancel_releases_quota_before_block()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var room = await RoomAsync();
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var created = await client.PostAsJsonAsync("api/manager/pt-sessions", new CreatePtSessionRequest
        { EntitlementId = entitlement.EntitlementId, StartAtUtc = FutureStart(), RoomId = room });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var session = (await created.Content.ReadApiJsonAsync<PtSessionResponse>())!;
        var incident = new SportHub.Scheduling.Rental.Application.IncidentRequest("Room", room,
            session.StartAtUtc, session.EndAtUtc, "PT court repair");
        var previewResponse = await client.PostAsJsonAsync("api/manager/incidents/preview", incident);
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        var preview = (await previewResponse.Content.ReadFromJsonAsync<SportHub.Scheduling.Rental.Application.IncidentPreviewResponse>())!;
        Assert.False(preview.CanResolve);
        Assert.Contains(preview.Impacts.SelectMany(x => x.ResolutionOptions), x => x.Action == "CancelByCenter");
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("api/manager/incidents/resolve", incident)).StatusCode);
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"api/manager/pt-sessions/{session.SessionId}/cancel",
            new ManagerCancelPtSessionRequest { Reason = "PT court repair" })).StatusCode);
        Assert.True((await client.PostAsJsonAsync("api/manager/incidents/resolve", incident)).IsSuccessStatusCode);
        var quota = await factory.QueryAsync(db => db.PtEntitlements.Where(x => x.EntitlementId == entitlement.EntitlementId)
            .Select(x => new { x.ReservedSessions, x.ConsumedSessions }).SingleAsync());
        Assert.Equal(0, quota.ReservedSessions);
        Assert.Equal(0, quota.ConsumedSessions);
        Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(x => x.UserId == member.UserId
            && x.SourceEntityId == session.SessionId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.Email)));
    }

    private static DateTime FutureStart() => DateTime.SpecifyKind(DateTime.UtcNow.Date.AddDays(7).AddHours(9), DateTimeKind.Utc);

    private async Task<int> RoomAsync(bool open = true, int roomTypeId = 2)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "PT-occ-" + Guid.NewGuid().ToString("N"), Capacity = 2, RoomTypeId = roomTypeId };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();
        if (open)
        {
            db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
            { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
            await db.SaveChangesAsync();
        }
        return room.RoomId;
    }

    [Fact]
    public async Task Room_booking_requires_compatibility_and_opening_hours_and_reserves_room_and_coach()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var closed = await RoomAsync(open: false);
        var wrongType = await RoomAsync(roomTypeId: 3);
        var room = await RoomAsync();
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = FutureStart(), RoomId = closed };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("api/manager/pt-sessions", request)).StatusCode);
        request.RoomId = wrongType;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("api/manager/pt-sessions", request)).StatusCode);
        request.RoomId = room;
        var created = await client.PostAsJsonAsync("api/manager/pt-sessions", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var session = await created.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal(room, session!.RoomId);
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));
        Assert.True(await factory.QueryAsync(db => db.CoachOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));
        var cancelled = await client.PostAsJsonAsync($"api/manager/pt-sessions/{session.SessionId}/cancel", new ManagerCancelPtSessionRequest { Reason = "Đổi lịch" });
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));
        Assert.False(await factory.QueryAsync(db => db.CoachOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));
    }

    [Fact]
    public async Task Same_room_is_exclusive_across_coaches_and_failed_reschedule_retains_original_slot()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coachA = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var coachB = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var memberA = await factory.SeedUserAsync(UserRole.Member);
        var memberB = await factory.SeedUserAsync(UserRole.Member);
        var a = await factory.SeedPtEntitlementAsync(memberA.UserId, coachA.UserId);
        var b = await factory.SeedPtEntitlementAsync(memberB.UserId, coachB.UserId);
        var room = await RoomAsync();
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var start = FutureStart();
        var firstResponse = await client.PostAsJsonAsync("api/manager/pt-sessions", new CreatePtSessionRequest { EntitlementId = a.EntitlementId, StartAtUtc = start, RoomId = room });
        var first = await firstResponse.Content.ReadApiJsonAsync<PtSessionResponse>();
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        var conflict = await client.PostAsJsonAsync("api/manager/pt-sessions", new CreatePtSessionRequest { EntitlementId = b.EntitlementId, StartAtUtc = start.AddMinutes(30), RoomId = room });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var laterResponse = await client.PostAsJsonAsync("api/manager/pt-sessions", new CreatePtSessionRequest { EntitlementId = b.EntitlementId, StartAtUtc = start.AddHours(3), RoomId = room });
        Assert.Equal(HttpStatusCode.Created, laterResponse.StatusCode);
        var later = await laterResponse.Content.ReadApiJsonAsync<PtSessionResponse>();
        var move = await client.PostAsJsonAsync($"api/manager/pt-sessions/{later!.SessionId}/reschedule", new ManagerReschedulePtSessionRequest { NewStartAtUtc = start.AddMinutes(30), Reason = "Thử đổi giờ" });
        Assert.Equal(HttpStatusCode.Conflict, move.StatusCode);
        Assert.Equal(PtSessionStatus.Scheduled, await factory.QueryAsync(db => db.PtSessions.Where(x => x.SessionId == later.SessionId).Select(x => x.Status).SingleAsync()));
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(x => x.SourceId == later.SessionId && x.IsActive && x.StartAtUtc == start.AddHours(3))));
    }

    [Fact]
    public async Task Automatic_no_show_consumes_quota_once_and_releases_occupancy()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var room = await RoomAsync();
        var response = await factory.CreateApiClient(manager.UserId, UserRole.CenterManager)
            .PostAsJsonAsync("api/manager/pt-sessions", new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = FutureStart(), RoomId = room });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var session = await response.Content.ReadApiJsonAsync<PtSessionResponse>();
        var pastStart = DateTime.UtcNow.AddHours(-2);
        await factory.QueryAsync(db => db.PtSessions.Where(x => x.SessionId == session!.SessionId).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.StartAtUtc, pastStart).SetProperty(x => x.EndAtUtc, pastStart.AddMinutes(90))));
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PtSessionService>().FinalizeNoShowAsync(session!.SessionId);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PtSessionService>().FinalizeNoShowAsync(session!.SessionId);
        var state = await factory.QueryAsync(db => db.PtEntitlements.Where(x => x.EntitlementId == entitlement.EntitlementId)
            .Select(x => new { x.ReservedSessions, x.ConsumedSessions }).SingleAsync());
        Assert.Equal(0, state.ReservedSessions);
        Assert.Equal(1, state.ConsumedSessions);
        Assert.Equal(PtSessionStatus.NoShow, await factory.QueryAsync(db => db.PtSessions.Where(x => x.SessionId == session!.SessionId).Select(x => x.Status).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(x => x.SourceId == session!.SessionId && x.IsActive)));
        Assert.Equal(1, await factory.QueryAsync(db => db.AuditLogs.CountAsync(x => x.TargetId == session!.SessionId.ToString() && x.Action == "AUTO_NO_SHOW_PT_SESSION")));
    }
}
