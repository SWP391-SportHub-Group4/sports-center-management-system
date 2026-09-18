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

    // BR-64 noi ro "khong gioi han so lan check-in trong ngay" — day la diem khac
    // Enrollment/Attendance, nen chot bang test rieng chu khong chi dua vao viec
    // thieu unique index.
    [Fact]
    public async Task Multiple_check_ins_in_the_same_day_are_allowed()
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
        }

        var stored = await factory.QueryAsync(db =>
            db.GymCheckIns.CountAsync(c => c.MemberId == member.UserId));
        Assert.Equal(3, stored);
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
