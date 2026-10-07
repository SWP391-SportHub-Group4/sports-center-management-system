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
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

/// <summary>G05: Member tự đặt buổi PT vào khung trống của Coach được giao. Chạy cần Docker (Testcontainers).</summary>
[Collection(nameof(TrainingApiCollection))]
public sealed class PtSelfBookingTests(TrainingApiFactory factory)
{
    // Giờ địa phương (UTC+7) → UTC, bắt đầu từ nửa đêm UTC của ngày đó.
    private static DateTime Start(int days = 7, int hour = 9)
        => DateTime.SpecifyKind(DateTime.UtcNow.Date.AddDays(days).AddHours(hour - 7), DateTimeKind.Utc);

    private async Task<int> RoomAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "PT-self-" + Guid.NewGuid().ToString("N"), Capacity = 2, RoomTypeId = 2 };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();
        db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
        { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
        await db.SaveChangesAsync();
        return room.RoomId;
    }

    private async Task LinkAsync(Guid memberId, Guid coachId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.Set<CoachMemberRelationship>().Add(new CoachMemberRelationship
        {
            RelationshipId = Guid.NewGuid(),
            CoachId = coachId,
            MemberId = memberId,
            SourceType = RelationshipSourceType.AssignedByManager,
            Status = RelationshipStatus.Active,
            StartedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private async Task<(Guid MemberId, Guid CoachId, PtEntitlement Entitlement)> SeedAsync(int quota = 8)
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: quota);
        await LinkAsync(member.UserId, coach.UserId);
        return (member.UserId, coach.UserId, entitlement);
    }

    [Fact]
    public async Task Member_books_a_free_slot_and_the_session_holds_quota_coach_and_a_room()
    {
        var (memberId, _, entitlement) = await SeedAsync();
        var room = await RoomAsync();
        using var client = factory.CreateApiClient(memberId, UserRole.Member);

        var availability = await client.GetAsync($"api/members/me/pt-entitlements/{entitlement.EntitlementId}/availability");
        Assert.Equal(HttpStatusCode.OK, availability.StatusCode);
        var offered = (await availability.Content.ReadApiJsonAsync<PtAvailabilityResponse>())!;
        Assert.Null(offered.BookableReason);
        Assert.NotEmpty(offered.Slots);

        var slot = offered.Slots.First(s => s.Rooms.Any(r => r.RoomId == room));
        var booked = await client.PostAsJsonAsync("api/members/me/pt-sessions",
            new SelfBookPtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = slot.StartAtUtc });
        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
        var session = (await booked.Content.ReadApiJsonAsync<PtSessionResponse>())!;
        Assert.Equal(slot.StartAtUtc, session.StartAtUtc);
        Assert.NotNull(session.RoomId);

        var reserved = await factory.QueryAsync(db => db.PtEntitlements.Where(e => e.EntitlementId == entitlement.EntitlementId)
            .Select(e => e.ReservedSessions).SingleAsync());
        Assert.Equal(1, reserved);
        Assert.True(await factory.QueryAsync(db => db.CoachOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));

        // Khung vừa đặt biến mất khỏi danh sách trống của chính Member.
        var after = (await (await client.GetAsync($"api/members/me/pt-entitlements/{entitlement.EntitlementId}/availability"))
            .Content.ReadApiJsonAsync<PtAvailabilityResponse>())!;
        Assert.DoesNotContain(after.Slots, s => s.StartAtUtc == slot.StartAtUtc);
    }

    [Fact]
    public async Task Booking_the_same_time_twice_conflicts_and_does_not_double_reserve_quota()
    {
        var (memberId, _, entitlement) = await SeedAsync();
        await RoomAsync();
        using var client = factory.CreateApiClient(memberId, UserRole.Member);
        var request = new SelfBookPtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = Start() };

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("api/members/me/pt-sessions", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("api/members/me/pt-sessions", request)).StatusCode);

        var reserved = await factory.QueryAsync(db => db.PtEntitlements.Where(e => e.EntitlementId == entitlement.EntitlementId)
            .Select(e => e.ReservedSessions).SingleAsync());
        Assert.Equal(1, reserved);
    }

    [Fact]
    public async Task Another_member_cannot_see_or_book_with_a_foreign_entitlement()
    {
        var (_, _, entitlement) = await SeedAsync();
        var intruder = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(intruder.UserId, UserRole.Member);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"api/members/me/pt-entitlements/{entitlement.EntitlementId}/availability")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("api/members/me/pt-sessions",
            new SelfBookPtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = Start() })).StatusCode);
    }

    [Fact]
    public async Task Policy_rejects_off_grid_too_soon_and_too_far_starts()
    {
        var (memberId, _, entitlement) = await SeedAsync();
        await RoomAsync();
        using var client = factory.CreateApiClient(memberId, UserRole.Member);

        async Task<HttpStatusCode> StatusAsync(DateTime start)
            => (await client.PostAsJsonAsync("api/members/me/pt-sessions",
                new SelfBookPtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = start })).StatusCode;

        Assert.Equal(HttpStatusCode.BadRequest, await StatusAsync(Start().AddMinutes(10)));
        Assert.Equal(HttpStatusCode.BadRequest, await StatusAsync(DateTime.UtcNow.AddHours(2)));
        Assert.Equal(HttpStatusCode.BadRequest, await StatusAsync(Start(days: 60)));
    }

    [Fact]
    public async Task Missing_relationship_and_exhausted_quota_are_reported_without_offering_slots()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var unlinkedEntitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        await RoomAsync();
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        var unlinked = (await (await client.GetAsync($"api/members/me/pt-entitlements/{unlinkedEntitlement.EntitlementId}/availability"))
            .Content.ReadApiJsonAsync<PtAvailabilityResponse>())!;
        Assert.Equal("pt_relationship_required", unlinked.BookableReason);
        Assert.Empty(unlinked.Slots);

        var (memberId, _, single) = await SeedAsync(quota: 1);
        using var other = factory.CreateApiClient(memberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Created, (await other.PostAsJsonAsync("api/members/me/pt-sessions",
            new SelfBookPtSessionRequest { EntitlementId = single.EntitlementId, StartAtUtc = Start() })).StatusCode);
        var exhausted = (await (await other.GetAsync($"api/members/me/pt-entitlements/{single.EntitlementId}/availability"))
            .Content.ReadApiJsonAsync<PtAvailabilityResponse>())!;
        Assert.Equal("pt_quota_exhausted", exhausted.BookableReason);
        Assert.Equal(HttpStatusCode.Conflict, (await other.PostAsJsonAsync("api/members/me/pt-sessions",
            new SelfBookPtSessionRequest { EntitlementId = single.EntitlementId, StartAtUtc = Start(hour: 14) })).StatusCode);
    }
}
