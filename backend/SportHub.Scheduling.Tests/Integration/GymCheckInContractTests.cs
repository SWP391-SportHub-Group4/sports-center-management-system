using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>Hop dong POST /api/gym-checkins theo BR-64.</summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class GymCheckInContractTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Receptionist_can_check_in_a_member_holding_an_active_package()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var before = DateTime.UtcNow;

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(member.UserId, body.GetProperty("memberId").GetGuid());

        // Nguoi check-in lay tu JWT, khong tu payload.
        Assert.Equal(receptionist.UserId, body.GetProperty("checkedInByUserId").GetGuid());

        // Thoi diem lay tu dong ho server.
        var checkInTime = body.GetProperty("checkInTime").GetDateTime();
        Assert.InRange(checkInTime, before.AddSeconds(-5), DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Payload_cannot_forge_the_operator_or_the_timestamp()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var otherReceptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync("/api/gym-checkins", new
        {
            targetMemberId = member.UserId,
            checkedInByUserId = otherReceptionist.UserId,
            checkInTime = new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc)
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(receptionist.UserId, body.GetProperty("checkedInByUserId").GetGuid());
        Assert.NotEqual(2000, body.GetProperty("checkInTime").GetDateTime().Year);
    }

    [Fact]
    public async Task Member_without_any_active_package_is_rejected_with_409()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("no_active_member_package", body.GetProperty("error").GetString());

        var stored = await factory.QueryAsync(db =>
            db.GymCheckIns.CountAsync(c => c.MemberId == member.UserId));
        Assert.Equal(0, stored);
    }

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task Locked_member_cannot_check_in_even_with_an_active_package(UserStatus status)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);
        await factory.QueryAsync(db => db.UserAccounts
            .Where(x => x.UserId == member.UserId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, status)));

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("member_not_active", body.GetProperty("error").GetString());
        Assert.Equal(0, await factory.QueryAsync(db => db.GymCheckIns
            .CountAsync(c => c.MemberId == member.UserId)));
    }

    [Theory]
    [InlineData(MemberPackageStatus.PendingPayment)]
    [InlineData(MemberPackageStatus.Expired)]
    [InlineData(MemberPackageStatus.Cancelled)]
    public async Task Packages_that_are_not_active_do_not_satisfy_BR64(MemberPackageStatus status)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId, status);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Active_package_past_its_end_date_does_not_allow_check_in()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(
            member.UserId, endDate: DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3));

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Any_one_active_package_is_enough_even_next_to_inactive_ones()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId, MemberPackageStatus.Cancelled);
        await factory.SeedMemberPackageAsync(member.UserId, MemberPackageStatus.Expired);
        await factory.SeedMemberPackageAsync(member.UserId);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // Unlimited Gym access allows re-entry after checkout, not duplicate open visits.
    [Fact]
    public async Task Multiple_visits_in_the_same_day_are_allowed_after_checkout()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        for (var i = 0; i < 3; i++)
        {
            var response = await client.PostAsJsonAsync(
                "/api/gym-checkins",
                new { targetMemberId = member.UserId });

            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            if (i < 2)
            {
                var visit = await response.Content.ReadFromJsonAsync<JsonElement>();
                var id = visit.GetProperty("checkInId").GetGuid();
                Assert.Equal(HttpStatusCode.OK,
                    (await client.PostAsync($"/api/gym-checkins/{id}/checkout", null)).StatusCode);
            }
        }

        var stored = await factory.QueryAsync(db =>
            db.GymCheckIns.CountAsync(c => c.MemberId == member.UserId));
        Assert.Equal(3, stored);
        Assert.Equal(1, await factory.QueryAsync(db => db.GymCheckIns
            .CountAsync(c => c.MemberId == member.UserId && c.CheckOutTime == null)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public async Task Open_visit_rejects_another_check_in_even_on_the_next_day(int daysAgo)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);
        using var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var first = await client.PostAsJsonAsync("/api/gym-checkins", new { targetMemberId = member.UserId });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var original = await first.Content.ReadFromJsonAsync<JsonElement>();
        var id = original.GetProperty("checkInId").GetGuid();
        if (daysAgo > 0)
            await factory.QueryAsync(db => db.GymCheckIns.Where(x => x.CheckInId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.CheckInTime, DateTime.UtcNow.AddDays(-daysAgo))));
        var again = await client.PostAsJsonAsync("/api/gym-checkins", new { targetMemberId = member.UserId });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var error = await again.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("gym_already_checked_in", error.GetProperty("error").GetString());
        Assert.Equal("Gym already checked in.", error.GetProperty("message").GetString());
        Assert.Equal(1, await factory.QueryAsync(db => db.GymCheckIns.CountAsync(x => x.MemberId == member.UserId)));
        Assert.Equal(id, await factory.QueryAsync(db => db.GymCheckIns.Where(x => x.MemberId == member.UserId)
            .Select(x => x.CheckInId).SingleAsync()));
    }

    // Gym khac lop: khong tru buoi, khong sinh Enrollment/Attendance.
    [Theory]
    [InlineData(10)]
    [InlineData(0)]
    [InlineData(null)]
    public async Task Check_in_never_touches_remaining_sessions_nor_creates_enrollment(int? remainingSessions)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var package = await factory.SeedMemberPackageAsync(
            member.UserId,
            remainingSessions: remainingSessions);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var reloaded = await factory.ReloadPackageAsync(package.MemberPackageId);
        Assert.Equal(remainingSessions, reloaded.RemainingSessions);
        Assert.Equal(MemberPackageStatus.Active, reloaded.Status);

        var enrollments = await factory.QueryAsync(db =>
            db.Enrollments.CountAsync(e => e.MemberId == member.UserId));
        Assert.Equal(0, enrollments);
    }

    [Fact]
    public async Task Target_that_is_not_a_member_is_rejected_with_404()
    {
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(coach.UserId);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = coach.UserId });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_target_is_rejected_with_404_and_writes_nothing()
    {
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var unknownId = Guid.NewGuid();

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = unknownId });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var stored = await factory.QueryAsync(db => db.GymCheckIns.CountAsync(c => c.MemberId == unknownId));
        Assert.Equal(0, stored);
    }

    [Fact]
    public async Task Missing_target_member_id_is_a_400()
    {
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var response = await client.PostAsJsonAsync("/api/gym-checkins", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
