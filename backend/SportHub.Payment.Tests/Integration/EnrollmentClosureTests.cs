using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Domain.Entities;
using NotificationChannel = SportHub.Notification.Domain.Enums.NotificationChannel;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// Closing enrollment only stops NEW seat holds. A checkout that already holds a seat must still be able to
/// finish paying, the seat count must stay consistent, and reopening must return the class to normal.
/// </summary>
[Collection(nameof(PaymentApiCollection))]
public sealed class EnrollmentClosureTests(PaymentApiFactory factory)
{
    private sealed record Course(int ClassId, Guid ManagerId, Guid ReceptionistId);

    private async Task<Course> SeedCourseAsync(int capacity = 3)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var room = new Room
        {
            Name = "Closure-room-" + Guid.NewGuid().ToString("N"),
            Capacity = 5,
            RoomTypeId = 3
        };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();

        db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
        {
            RoomId = room.RoomId,
            DayOfWeek = day,
            OpenTimeLocal = new(6, 0),
            CloseTimeLocal = new(22, 0)
        }));
        db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = coach.UserId, SportId = 3 });
        db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
        await db.SaveChangesAsync();

        var start = VietnamTime.TodayLocal(scope.ServiceProvider.GetRequiredService<IClock>()).AddDays(30);
        var classes = scope.ServiceProvider.GetRequiredService<IClassService>();
        var created = await classes.CreateAsync(new SaveClassRequest
        {
            Code = "CLOSURE-" + Guid.NewGuid().ToString("N"),
            Name = "Closure class",
            SportId = 3,
            CoachId = coach.UserId,
            DefaultRoomId = room.RoomId,
            StartDate = start,
            NumSessions = 3,
            Capacity = capacity,
            Price = 100_000m,
            CostAmount = 0,
            ScheduleRules = [new() { DayOfWeek = (int)start.DayOfWeek, StartTimeLocal = "09:00" }]
        }, manager.UserId);

        await classes.PublishAsync(created.ClassId, new(), manager.UserId);
        await classes.SetEnrollmentOpenAsync(created.ClassId, true, manager.UserId);

        return new Course(created.ClassId, manager.UserId, receptionist.UserId);
    }

    private static async Task<HttpResponseMessage> CheckoutAsync(HttpClient member, int classId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/class")
        {
            Content = JsonContent.Create(new { classId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        return await member.SendAsync(request);
    }

    private async Task SetOpenAsync(Course course, bool open, string? reason = null)
    {
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IClassService>()
            .SetEnrollmentOpenAsync(course.ClassId, open, course.ManagerId, default, reason);
    }

    private async Task PayAsync(Course course, HttpClient member, CheckoutResponse checkout)
    {
        var attempt = (await (await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null))
            .Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;

        using var receptionist = factory.CreateApiClient(course.ReceptionistId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.OK,
            (await receptionist.PostAsync($"/api/dev/payments/{attempt.TransactionReference}/simulate", null)).StatusCode);
    }

    private Task<(int Confirmed, int Reserved)> CountsAsync(int classId)
        => factory.QueryAsync(async db =>
        {
            var row = await db.Classes.Where(x => x.ClassId == classId)
                .Select(x => new { x.ConfirmedCount, x.ReservedCount }).SingleAsync();
            return (row.ConfirmedCount, row.ReservedCount);
        });

    [Fact]
    public async Task Hold_taken_before_close_can_still_be_paid_but_new_members_are_rejected()
    {
        var course = await SeedCourseAsync();
        var holder = await factory.SeedUserAsync(UserRole.Member);
        var newcomer = await factory.SeedUserAsync(UserRole.Member);

        using var holderClient = factory.CreateApiClient(holder.UserId, UserRole.Member);
        using var newcomerClient = factory.CreateApiClient(newcomer.UserId, UserRole.Member);

        var created = await CheckoutAsync(holderClient, course.ClassId);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal((0, 1), await CountsAsync(course.ClassId));

        await SetOpenAsync(course, false, "Court flooded");

        // A brand-new checkout is refused with a dedicated code, not a misleading "class full".
        var rejected = await CheckoutAsync(newcomerClient, course.ClassId);
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        Assert.Contains("enrollment_closed", await rejected.Content.ReadAsStringAsync());
        Assert.Equal((0, 1), await CountsAsync(course.ClassId));

        // The checkout that already holds a seat completes normally while enrollment is closed.
        await PayAsync(course, holderClient, checkout);

        var result = (await holderClient.GetFromJsonAsync<CheckoutResponse>($"/api/checkouts/{checkout.InvoiceId}"))!;
        Assert.Equal("Paid", result.InvoiceStatus);
        Assert.Equal("Fulfilled", result.FulfillmentOutcome);
        Assert.Equal((1, 1), await CountsAsync(course.ClassId));
        Assert.Equal(1, await factory.QueryAsync(db => db.Enrollments.CountAsync(x =>
            x.ClassId == course.ClassId && x.MemberId == holder.UserId && x.Status == EnrollmentStatus.Confirmed)));
        Assert.False(await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.ClassId)
            .Select(x => x.EnrollmentOpen).SingleAsync()));
    }

    [Fact]
    public async Task My_class_holds_lists_a_live_hold_even_after_close_and_drops_it_once_paid()
    {
        var course = await SeedCourseAsync();
        var holder = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        using var holderClient = factory.CreateApiClient(holder.UserId, UserRole.Member);
        using var otherClient = factory.CreateApiClient(other.UserId, UserRole.Member);

        var checkout = (await (await CheckoutAsync(holderClient, course.ClassId))
            .Content.ReadFromJsonAsync<CheckoutResponse>())!;
        await SetOpenAsync(course, false, "Court flooded");

        var holds = (await holderClient.GetFromJsonAsync<List<ClassHoldDto>>("/api/members/me/class-holds"))!;
        var hold = Assert.Single(holds);
        Assert.Equal(course.ClassId, hold.ClassId);
        Assert.Equal(checkout.InvoiceId, hold.InvoiceId);

        // Holds are private to their owner.
        Assert.Empty((await otherClient.GetFromJsonAsync<List<ClassHoldDto>>("/api/members/me/class-holds"))!);

        await PayAsync(course, holderClient, checkout);
        Assert.Empty((await holderClient.GetFromJsonAsync<List<ClassHoldDto>>("/api/members/me/class-holds"))!);
    }

    private sealed record ClassHoldDto(int ClassId, Guid InvoiceId, DateTime ExpiresAtUtc);

    [Fact]
    public async Task Reopening_while_payment_is_pending_returns_the_class_to_normal_without_double_counting()
    {
        var course = await SeedCourseAsync();
        var holder = await factory.SeedUserAsync(UserRole.Member);
        var newcomer = await factory.SeedUserAsync(UserRole.Member);

        using var holderClient = factory.CreateApiClient(holder.UserId, UserRole.Member);
        using var newcomerClient = factory.CreateApiClient(newcomer.UserId, UserRole.Member);

        var checkout = (await (await CheckoutAsync(holderClient, course.ClassId))
            .Content.ReadFromJsonAsync<CheckoutResponse>())!;

        await SetOpenAsync(course, false, "Court flooded");
        await SetOpenAsync(course, true);

        // Normal again: someone new can hold a seat, and the pending payment still completes.
        var second = await CheckoutAsync(newcomerClient, course.ClassId);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Equal((0, 2), await CountsAsync(course.ClassId));

        await PayAsync(course, holderClient, checkout);

        Assert.Equal((1, 2), await CountsAsync(course.ClassId));
        var cls = await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.ClassId)
            .Select(x => new { x.EnrollmentOpen, x.EnrollmentClosedReason, x.EnrollmentClosedAtUtc }).SingleAsync());
        Assert.True(cls.EnrollmentOpen);
        Assert.Null(cls.EnrollmentClosedReason);
        Assert.Null(cls.EnrollmentClosedAtUtc);
    }

    [Fact]
    public async Task Closing_with_a_reason_notifies_enrolled_members_in_english_and_reopening_notifies_again()
    {
        var course = await SeedCourseAsync();
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        var checkout = (await (await CheckoutAsync(client, course.ClassId))
            .Content.ReadFromJsonAsync<CheckoutResponse>())!;
        await PayAsync(course, client, checkout);

        await SetOpenAsync(course, false, "Court flooded");

        var closed = await factory.QueryAsync(db => db.Notifications.AsNoTracking()
            .Where(x => x.UserId == member.UserId && x.SourceEventType == NotificationSourceEventType.ClassEnrollmentClosed)
            .ToListAsync());
        Assert.Equal(2, closed.Count);
        Assert.Contains(closed, x => x.Channel == NotificationChannel.InApp && x.Message.Contains("Court flooded")
            && x.Message.Contains("refund request"));
        Assert.Contains(closed, x => x.Channel == NotificationChannel.Email && x.RecipientAddress == member.Email);

        await SetOpenAsync(course, true);

        var reopened = await factory.QueryAsync(db => db.Notifications.AsNoTracking()
            .Where(x => x.UserId == member.UserId && x.SourceEventType == NotificationSourceEventType.ClassEnrollmentReopened)
            .ToListAsync());
        Assert.Equal(2, reopened.Count);
        Assert.Contains(reopened, x => x.Channel == NotificationChannel.InApp && x.Message.Contains("resolved"));
    }

    [Fact]
    public async Task Closing_without_a_reason_is_rejected_and_leaves_enrollment_open()
    {
        var course = await SeedCourseAsync();

        foreach (var reason in new string?[] { null, "  ", "x" })
        {
            var ex = await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.BadRequestException>(
                () => SetOpenAsync(course, false, reason));
            Assert.Equal("enrollment_close_reason_required", ex.ErrorCode);
        }

        Assert.True(await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.ClassId)
            .Select(x => x.EnrollmentOpen).SingleAsync()));
    }

    [Fact]
    public async Task Close_endpoint_stores_the_reason_and_rejects_a_too_short_one()
    {
        var course = await SeedCourseAsync();
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);

        var bad = await manager.PostAsJsonAsync($"/api/manager/classes/{course.ClassId}/enrollment/close", new { reason = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var missing = await manager.PostAsync($"/api/manager/classes/{course.ClassId}/enrollment/close", null);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        var ok = await manager.PostAsJsonAsync($"/api/manager/classes/{course.ClassId}/enrollment/close",
            new { reason = "  Court flooded  " });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        var cls = await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.ClassId)
            .Select(x => new { x.EnrollmentOpen, x.EnrollmentClosedReason }).SingleAsync());
        Assert.False(cls.EnrollmentOpen);
        Assert.Equal("Court flooded", cls.EnrollmentClosedReason);
    }
}
