using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Constants;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ManagerReportingApiTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Membership_summary_counts_distinct_active_members_and_package_statuses()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var asOfDate = new DateOnly(2030, 1, 15);
        var before = await GetMembershipSummaryAsync(client, asOfDate);

        var activeMember = await factory.SeedUserAsync(UserRole.Member);
        var memberWithoutActiveMembership = await factory.SeedUserAsync(UserRole.Member);

        await SeedPackagesAsync(
            activeMember.UserId,
            asOfDate,
            MemberPackageStatus.Active,
            MemberPackageStatus.Active,
            MemberPackageStatus.Expired,
            MemberPackageStatus.Cancelled,
            MemberPackageStatus.PendingPayment);

        // Status Active nhưng ngoài validity không được làm member thứ hai thành active.
        await SeedPackageAsync(
            memberWithoutActiveMembership.UserId,
            MemberPackageStatus.Active,
            asOfDate.AddYears(-1),
            asOfDate.AddDays(-1));

        var after = await GetMembershipSummaryAsync(client, asOfDate);

        Assert.Equal(before.TotalMembers + 2, after.TotalMembers);
        Assert.Equal(before.MembersWithActiveMembership + 1, after.MembersWithActiveMembership);
        Assert.Equal(before.MembersWithoutActiveMembership + 1, after.MembersWithoutActiveMembership);
        Assert.Equal(before.PackagesByStatus.Active + 3, after.PackagesByStatus.Active);
        Assert.Equal(before.PackagesByStatus.Expired + 1, after.PackagesByStatus.Expired);
        Assert.Equal(before.PackagesByStatus.Cancelled + 1, after.PackagesByStatus.Cancelled);
        Assert.Equal(before.PackagesByStatus.PendingPayment + 1, after.PackagesByStatus.PendingPayment);
    }

    [Fact]
    public async Task Membership_validity_is_inclusive_at_start_and_end_dates()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var firstDayMember = await factory.SeedUserAsync(UserRole.Member);
        var lastDayMember = await factory.SeedUserAsync(UserRole.Member);
        var asOfDate = new DateOnly(2032, 5, 20);

        await SeedPackageAsync(firstDayMember.UserId, MemberPackageStatus.Active, asOfDate, asOfDate.AddDays(10));
        await SeedPackageAsync(lastDayMember.UserId, MemberPackageStatus.Active, asOfDate.AddDays(-10), asOfDate);

        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await GetMembershipSummaryAsync(client, asOfDate);

        Assert.True(response.MembersWithActiveMembership >= 2);
    }

    [Fact]
    public async Task Class_utilization_excludes_cancelled_and_rescheduled_from_utilization_rate()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var fromDate = new DateOnly(2031, 6, 10);
        var toDate = fromDate.AddDays(1);

        await SeedReportSessionsAsync(coach.UserId, fromDate);

        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.GetFromJsonAsync<ClassUtilizationReportResponse>(
            $"api/reports/class-utilization?fromDate={fromDate:yyyy-MM-dd}&toDate={toDate:yyyy-MM-dd}");

        Assert.NotNull(response);
        Assert.Equal(5, response.TotalSessions);
        Assert.Equal(1, response.ScheduledSessions);
        Assert.Equal(2, response.CompletedSessions);
        Assert.Equal(1, response.CancelledSessions);
        Assert.Equal(1, response.RescheduledSessions);
        Assert.Equal(50, response.TotalCapacity);
        Assert.Equal(38, response.TotalConfirmed);
        Assert.Equal(76m, response.UtilizationRate);
        Assert.Equal(response.TotalCapacity, response.ByClass.Sum(row => row.TotalCapacity));
        Assert.Equal(response.TotalConfirmed, response.ByClass.Sum(row => row.TotalConfirmed));
        Assert.Equal(response.TotalCapacity, response.Daily.Sum(row => row.TotalCapacity));
        Assert.Equal(response.TotalConfirmed, response.Daily.Sum(row => row.TotalConfirmed));

        Assert.Equal(2, response.ByClass.Count);
        var yoga = Assert.Single(response.ByClass, row => row.Discipline == Disciplines.Yoga);
        Assert.Equal(2, yoga.SessionCount);
        Assert.Equal(30, yoga.TotalCapacity);
        Assert.Equal(18, yoga.TotalConfirmed);
        Assert.Equal(60m, yoga.UtilizationRate);

        var groupX = Assert.Single(response.ByClass, row => row.Discipline == Disciplines.GroupX);
        Assert.Equal(100m, groupX.UtilizationRate);

        Assert.Collection(
            response.Daily,
            first =>
            {
                Assert.Equal(fromDate, first.Date);
                Assert.Equal(2, first.SessionCount);
                Assert.Equal(60m, first.UtilizationRate);
            },
            second =>
            {
                Assert.Equal(toDate, second.Date);
                Assert.Equal(1, second.SessionCount);
                Assert.Equal(100m, second.UtilizationRate);
            });
    }

    [Fact]
    public async Task Class_utilization_uses_vietnam_day_boundaries_and_zero_rate_for_empty_range()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var day = new DateOnly(2034, 8, 20);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var room = new Room { Name = $"Boundary room {Guid.NewGuid():N}", Capacity = 20 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();

            var yoga = NewClass("Boundary Yoga", Disciplines.Yoga, room.RoomId, coach.UserId, 10);
            db.Classes.Add(yoga);
            await db.SaveChangesAsync();

            db.ClassSessions.AddRange(
                NewSession(yoga, room.RoomId, coach.UserId, day.AddDays(-1), 23, 10, 1, ClassSessionStatus.Completed, 59),
                NewSession(yoga, room.RoomId, coach.UserId, day, 0, 10, 2, ClassSessionStatus.Completed),
                NewSession(yoga, room.RoomId, coach.UserId, day, 23, 10, 3, ClassSessionStatus.Completed, 59),
                NewSession(yoga, room.RoomId, coach.UserId, day.AddDays(1), 0, 10, 4, ClassSessionStatus.Completed));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.GetFromJsonAsync<ClassUtilizationReportResponse>(
            $"api/reports/class-utilization?fromDate={day:yyyy-MM-dd}&toDate={day:yyyy-MM-dd}");

        Assert.NotNull(response);
        Assert.Equal(2, response.TotalSessions);
        Assert.Equal(20, response.TotalCapacity);
        Assert.Equal(5, response.TotalConfirmed);
        Assert.Equal(25m, response.UtilizationRate);

        var emptyDay = day.AddDays(10);
        var empty = await client.GetFromJsonAsync<ClassUtilizationReportResponse>(
            $"api/reports/class-utilization?fromDate={emptyDay:yyyy-MM-dd}&toDate={emptyDay:yyyy-MM-dd}");

        Assert.NotNull(empty);
        Assert.Equal(0, empty.TotalCapacity);
        Assert.Equal(0m, empty.UtilizationRate);
        Assert.Empty(empty.ByClass);
        Assert.Empty(empty.Daily);
    }

    [Fact]
    public async Task Class_utilization_filters_yoga_and_rejects_invalid_ranges_and_disciplines()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var day = new DateOnly(2033, 7, 10);
        await SeedReportSessionsAsync(coach.UserId, day);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var yoga = await client.GetFromJsonAsync<ClassUtilizationReportResponse>(
            $"api/reports/class-utilization?fromDate={day:yyyy-MM-dd}&toDate={day.AddDays(1):yyyy-MM-dd}"
            + $"&discipline={Disciplines.Yoga}");

        Assert.NotNull(yoga);
        Assert.Equal(4, yoga.TotalSessions);
        Assert.All(yoga.ByClass, row => Assert.Equal(Disciplines.Yoga, row.Discipline));

        var inverted = await client.GetAsync(
            $"api/reports/class-utilization?fromDate={day.AddDays(1):yyyy-MM-dd}&toDate={day:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, inverted.StatusCode);
        Assert.Contains("invalid_date_range", await inverted.Content.ReadAsStringAsync());

        var tooLarge = await client.GetAsync(
            $"api/reports/class-utilization?fromDate={day:yyyy-MM-dd}&toDate={day.AddDays(367):yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, tooLarge.StatusCode);
        Assert.Contains("range_too_large", await tooLarge.Content.ReadAsStringAsync());

        var invalidDiscipline = await client.GetAsync(
            $"api/reports/class-utilization?fromDate={day:yyyy-MM-dd}&toDate={day:yyyy-MM-dd}&discipline=PersonalTraining");
        Assert.Equal(HttpStatusCode.BadRequest, invalidDiscipline.StatusCode);
        Assert.Contains("invalid_discipline", await invalidDiscipline.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(UserRole.SystemAdministrator)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Member)]
    public async Task Reports_forbid_non_manager_roles(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(user.UserId, role);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/reports/membership-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/reports/class-utilization")).StatusCode);
    }

    [Fact]
    public async Task Reports_require_authentication()
    {
        var client = factory.CreateApiClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/reports/membership-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/reports/class-utilization")).StatusCode);
    }

    private static async Task<MembershipSummaryResponse> GetMembershipSummaryAsync(
        HttpClient client,
        DateOnly asOfDate)
        => await client.GetFromJsonAsync<MembershipSummaryResponse>(
               $"api/reports/membership-summary?asOfDate={asOfDate:yyyy-MM-dd}")
           ?? throw new InvalidOperationException("Membership summary response was empty.");

    private async Task SeedPackagesAsync(
        Guid memberId,
        DateOnly asOfDate,
        params MemberPackageStatus[] statuses)
    {
        foreach (var status in statuses)
        {
            await SeedPackageAsync(memberId, status, asOfDate.AddDays(-1), asOfDate.AddDays(1));
        }
    }

    private async Task SeedPackageAsync(
        Guid memberId,
        MemberPackageStatus status,
        DateOnly startDate,
        DateOnly endDate)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var catalog = new MembershipPackage
        {
            Name = $"Report package {Guid.NewGuid():N}",
            Price = 500_000m,
            DurationDays = 30,
            SessionLimit = 10
        };
        db.MembershipPackages.Add(catalog);
        await db.SaveChangesAsync();

        db.MemberPackages.Add(new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = memberId,
            PackageId = catalog.PackageId,
            StartDate = startDate,
            EndDate = endDate,
            RemainingSessions = 10,
            Status = status
        });
        await db.SaveChangesAsync();
    }

    private async Task SeedReportSessionsAsync(Guid coachId, DateOnly firstDay)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var room = new Room { Name = $"Report room {Guid.NewGuid():N}", Capacity = 40 };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();

        // Đổi 29/09/2026 (BE-4): không còn seed Class "PersonalTraining" — CK_classes_discipline_allowed
        // giờ chỉ nhận Yoga/GroupX, PT dùng PtEntitlement/PtSession riêng nên không thể (và không
        // cần) xuất hiện ở report class-utilization nữa.
        var yoga = NewClass("Yoga report", Disciplines.Yoga, room.RoomId, coachId, 30);
        var groupX = NewClass("Group X report", Disciplines.GroupX, room.RoomId, coachId, 20);
        db.Classes.AddRange(yoga, groupX);
        await db.SaveChangesAsync();

        db.ClassSessions.AddRange(
            NewSession(yoga, room.RoomId, coachId, firstDay, 8, 20, 10, ClassSessionStatus.Scheduled),
            NewSession(yoga, room.RoomId, coachId, firstDay, 10, 10, 8, ClassSessionStatus.Completed),
            NewSession(yoga, room.RoomId, coachId, firstDay, 12, 30, 15, ClassSessionStatus.Cancelled),
            NewSession(yoga, room.RoomId, coachId, firstDay, 14, 20, 5, ClassSessionStatus.Rescheduled),
            NewSession(groupX, room.RoomId, coachId, firstDay.AddDays(1), 9, 20, 20, ClassSessionStatus.Completed));

        await db.SaveChangesAsync();
    }

    private static Class NewClass(string prefix, string discipline, int roomId, Guid coachId, int capacity)
        => new()
        {
            Name = $"{prefix} {Guid.NewGuid():N}",
            Discipline = discipline,
            DefaultRoomId = roomId,
            DefaultCoachId = coachId,
            Capacity = capacity,
            Status = ClassStatus.Active
        };

    private static ClassSession NewSession(
        Class classEntity,
        int roomId,
        Guid coachId,
        DateOnly localDate,
        int localHour,
        int capacity,
        int confirmed,
        ClassSessionStatus status,
        int localMinute = 0)
    {
        var start = VietnamTime.ToUtc(localDate.ToDateTime(new TimeOnly(localHour, localMinute)));
        return new ClassSession
        {
            SessionId = Guid.NewGuid(),
            Class = classEntity,
            RoomId = roomId,
            CoachId = coachId,
            StartAtUtc = start,
            EndAtUtc = start.AddHours(1),
            BaselineCapacity = capacity,
            Capacity = capacity,
            ConfirmedCount = confirmed,
            Status = status
        };
    }
}
