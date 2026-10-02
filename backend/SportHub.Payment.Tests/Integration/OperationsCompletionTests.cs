using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Application.DTOs;
using SportHub.Notification.Application.Services;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class OperationsCompletionTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Notice_parallel_retry_creates_one_receipt_and_private_delivery_status()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.CenterManager);
        var key = Guid.NewGuid().ToString();
        var request = new ManualNoticeRequest { RecipientUserIds = [member.UserId], Subject = "Course notice", Message = "Please read the new schedule" };
        async Task<Guid> Send()
        {
            using var scope = factory.Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<ManualNoticeService>().SendAsync(request, manager.UserId, idempotencyKey: key);
        }
        var ids = await Task.WhenAll(Send(), Send());
        Assert.Equal(ids[0], ids[1]);
        Assert.Equal(2, await factory.QueryAsync(db => db.Notifications.CountAsync(x => x.SourceEntityId == ids[0])));
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ManualNoticeService>();
        request.Message = "Changed content";
        Assert.Equal("notice_idempotency_conflict", (await Assert.ThrowsAsync<ConflictException>(() => service.SendAsync(request, manager.UserId, idempotencyKey: key))).ErrorCode);
        var receipt = await service.GetByKeyAsync(key, manager.UserId);
        Assert.Equal(2, receipt.Delivery.Total);
        Assert.Equal(2, receipt.Delivery.Pending);
        await Assert.ThrowsAsync<NotFoundException>(() => service.GetAsync(ids[0], other.UserId));
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.GetAsync($"/api/manager/notices/{ids[0]}")).StatusCode);
    }

    [Theory]
    [InlineData(false, 100)]
    [InlineData(true, 66)]
    public async Task Course_cancel_returns_exact_proration_releases_holds_and_is_repeat_safe(bool partiallyProvided, int expectedPoints)
    {
        var data = await CourseAsync();
        var member = await factory.SeedUserAsync(UserRole.Member);
        var waiting = await factory.SeedUserAsync(UserRole.Member);
        Guid invoiceId;
        Guid pendingId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using (var tx = await db.Database.BeginTransactionAsync())
            {
                var wallets = scope.ServiceProvider.GetRequiredService<IPointWalletService>();
                await wallets.EarnAsync(new(member.UserId, 200, "TestCredit", Guid.NewGuid()));
                await wallets.EarnAsync(new(waiting.UserId, 200, "TestCredit", Guid.NewGuid()));
                await tx.CommitAsync();
            }
            var checkout = scope.ServiceProvider.GetRequiredService<CheckoutService>();
            var paid = await checkout.CreateClassAsync(new(data.Id, null), Guid.NewGuid().ToString(), member.UserId, false, default);
            invoiceId = paid.InvoiceId;
            await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(invoiceId, 100, member.UserId, default);
            await checkout.StartPaymentAsync(invoiceId, member.UserId, false, "127.0.0.1", default);
            var held = await checkout.CreateClassAsync(new(data.Id, null), Guid.NewGuid().ToString(), waiting.UserId, false, default);
            pendingId = held.InvoiceId;
            await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(pendingId, 40, waiting.UserId, default);
        }
        if (partiallyProvided)
            await factory.QueryAsync(async db => {
                var session = await db.ClassSessions.Where(x => x.ClassId == data.Id).OrderBy(x => x.SessionNo).FirstAsync();
                session.Status = ClassSessionStatus.Completed;
                await db.Classes.Where(x => x.ClassId == data.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.InProgress));
                await db.SaveChangesAsync(); return 0;
            });
        await factory.QueryAsync(async db => {
            var enrollment = await db.Enrollments.SingleAsync(x => x.ClassId == data.Id && x.Status == EnrollmentStatus.Confirmed);
            db.Set<ThresholdResponse>().Add(new() { ThresholdResponseId = Guid.NewGuid(), ClassId = data.Id, EnrollmentId = enrollment.EnrollmentId,
                MemberId = member.UserId, TokenHash = "private-token-hash-" + Guid.NewGuid(), DeadlineUtc = DateTime.UtcNow.AddDays(1), CreatedAtUtc = DateTime.UtcNow,
                ResolutionStatus = ThresholdResolutionStatus.Pending });
            await db.Classes.Where(x => x.ClassId == data.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ThresholdStatus, ThresholdStatus.AtRisk));
            await db.SaveChangesAsync(); return 0;
        });
        using var manager = factory.CreateApiClient(data.ManagerId, UserRole.CenterManager);
        foreach (var path in new[] { "holds", "enrollments", "threshold-responses" })
        {
            var response = await manager.GetAsync($"/api/manager/classes/{data.Id}/{path}");
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            Assert.DoesNotContain("tokenHash", await response.Content.ReadAsStringAsync());
            Assert.DoesNotContain("private-token-hash", await response.Content.ReadAsStringAsync());
        }
        var filtered = await manager.GetAsync("/api/manager/classes?thresholdStatus=AT_RISK&sportId=3&pageSize=100");
        Assert.True(filtered.IsSuccessStatusCode, await filtered.Content.ReadAsStringAsync());
        using (var json = JsonDocument.Parse(await filtered.Content.ReadAsStringAsync()))
            Assert.All(json.RootElement.GetProperty("items").EnumerateArray(), x => Assert.Equal("AT_RISK", x.GetProperty("thresholdStatus").GetString()));
        var preview = await (await manager.GetAsync($"/api/manager/classes/{data.Id}/cancellation-preview")).Content.ReadFromJsonAsync<CourseCancellationPreview>();
        Assert.NotNull(preview);
        Assert.Equal(expectedPoints, preview.RefundPoints);
        Assert.Equal(1, preview.ActiveHoldCount);
        async Task<HttpResponseMessage> Cancel() => await manager.PostAsJsonAsync($"/api/manager/classes/{data.Id}/cancel",
            new { reason = "Center course cancellation", previewToken = preview.PreviewToken });
        var cancellations = await Task.WhenAll(Cancel(), Cancel());
        foreach (var response in cancellations) Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        Assert.True((await Cancel()).IsSuccessStatusCode);
        await factory.QueryAsync(async db => {
            var course = await db.Classes.SingleAsync(x => x.ClassId == data.Id);
            Assert.Equal(ClassStatus.Cancelled, course.Status);
            Assert.Equal(0, course.ConfirmedCount); Assert.Equal(0, course.ReservedCount);
            var wallet = await db.PointWallets.SingleAsync(x => x.OwnerUserId == member.UserId);
            Assert.Equal(100 + expectedPoints, wallet.AvailablePoints);
            var heldWallet = await db.PointWallets.SingleAsync(x => x.OwnerUserId == waiting.UserId);
            Assert.Equal(200, heldWallet.AvailablePoints); Assert.Equal(0, heldWallet.HeldPoints);
            Assert.Equal(SportHub.Payment.Domain.Enums.InvoiceStatus.Void, (await db.Invoices.SingleAsync(x => x.InvoiceId == pendingId)).Status);
            Assert.Equal(1, await db.PointLedgerEntries.CountAsync(x => x.WalletId == wallet.WalletId && x.ReferenceType == "SystemEvent"));
            Assert.False(await db.ClassSessions.AnyAsync(x => x.ClassId == data.Id && x.Status == ClassSessionStatus.Scheduled));
            Assert.Equal(ThresholdResolutionStatus.Expired, await db.Set<ThresholdResponse>().Where(x => x.ClassId == data.Id).Select(x => x.ResolutionStatus).SingleAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Gym_inside_is_paged_and_front_desk_only()
    {
        var staff = await factory.SeedUserAsync(UserRole.Receptionist);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await factory.QueryAsync(async db => {
            db.Set<GymCheckIn>().Add(new() { CheckInId = Guid.NewGuid(), MemberId = member.UserId,
                CheckedInByUserId = staff.UserId, CheckInTime = DateTime.UtcNow.AddMinutes(-10) });
            await db.SaveChangesAsync(); return 0;
        });
        using var client = factory.CreateApiClient(staff.UserId, UserRole.Receptionist);
        var result = await client.GetAsync("/api/gym-checkins/inside?pageSize=1");
        Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
        Assert.Single(json.RootElement.GetProperty("items").EnumerateArray());
        using var privateClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await privateClient.GetAsync("/api/gym-checkins/inside")).StatusCode);
    }

    private async Task<(int Id, Guid ManagerId)> CourseAsync()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "P2 cancel " + Guid.NewGuid(), Capacity = 8, RoomTypeId = 3 };
        db.Rooms.Add(room); await db.SaveChangesAsync();
        db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
            { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
        db.UserSportSpecialties.Add(new() { UserId = coach.UserId, SportId = 3 });
        db.CoachProfiles.Add(new() { UserId = coach.UserId }); await db.SaveChangesAsync();
        var start = new DateOnly(2032, 3, 1);
        var service = scope.ServiceProvider.GetRequiredService<IClassService>();
        var course = await service.CreateAsync(new SaveClassRequest { Code = "P2-" + Guid.NewGuid(), Name = "Cancellation test",
            SportId = 3, CoachId = coach.UserId, DefaultRoomId = room.RoomId, StartDate = start, NumSessions = 3,
            Capacity = 8, Price = 100000, CostAmount = 0,
            ScheduleRules = [new() { DayOfWeek = (int)start.DayOfWeek, StartTimeLocal = "09:00" }] }, manager.UserId);
        await service.PublishAsync(course.ClassId, new(), manager.UserId);
        return (course.ClassId, manager.UserId);
    }

    [Fact]
    public async Task Cancellation_rechecks_preview_after_new_checkout_and_serializes_with_reservation()
    {
        var data = await CourseAsync();
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var manager = factory.CreateApiClient(data.ManagerId, UserRole.CenterManager);
        var preview = await (await manager.GetAsync($"/api/manager/classes/{data.Id}/cancellation-preview")).Content.ReadFromJsonAsync<CourseCancellationPreview>();
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/class") { Content = JsonContent.Create(new { classId = data.Id }) };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var booking = client.SendAsync(request);
        var cancellation = manager.PostAsJsonAsync($"/api/manager/classes/{data.Id}/cancel", new { reason = "Cancel concurrently", previewToken = preview!.PreviewToken });
        await Task.WhenAll(booking, cancellation);
        var bookingResult = await booking;
        var cancellationResult = await cancellation;
        Assert.True(bookingResult.StatusCode == HttpStatusCode.Created && cancellationResult.StatusCode == HttpStatusCode.Conflict
            || bookingResult.StatusCode == HttpStatusCode.Conflict && cancellationResult.IsSuccessStatusCode,
            $"booking={bookingResult.StatusCode}, cancel={cancellationResult.StatusCode}");
        await factory.QueryAsync(async db => {
            var course = await db.Classes.SingleAsync(x => x.ClassId == data.Id);
            var holds = await db.SeatHolds.CountAsync(x => x.ClassId == data.Id && x.Status == SeatHoldStatus.Active);
            Assert.Equal(holds, course.ReservedCount);
            Assert.Equal(course.Status == ClassStatus.Cancelled ? 0 : 1, holds);
            return 0;
        });
        if (bookingResult.IsSuccessStatusCode)
        {
            var checkout = await bookingResult.Content.ReadFromJsonAsync<SportHub.Payment.Application.DTOs.Checkouts.CheckoutResponse>();
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<CheckoutService>()
                .CancelAsync(checkout!.InvoiceId, member.UserId, false, default);
        }
    }

    [Fact]
    public async Task Late_payment_after_course_cancellation_compensates_cash_without_enrolling()
    {
        var data = await CourseAsync();
        var member = await factory.SeedUserAsync(UserRole.Member);
        Guid invoiceId;
        SportHub.Payment.Application.DTOs.Checkouts.PaymentAttemptResponse attempt;
        using (var scope = factory.Services.CreateScope())
        {
            var checkout = scope.ServiceProvider.GetRequiredService<CheckoutService>();
            var held = await checkout.CreateClassAsync(new(data.Id, null), Guid.NewGuid().ToString(), member.UserId, false, default);
            invoiceId = held.InvoiceId;
            attempt = await checkout.StartPaymentAsync(invoiceId, member.UserId, false, "127.0.0.1", default);
        }
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<CourseCancellationService>();
            var preview = await service.PreviewAsync(data.Id);
            await service.CancelAsync(data.Id, new() { Reason = "Cancel while payment pending", PreviewToken = preview.PreviewToken }, data.ManagerId);
        }
        var gateway = Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());
        using (var scope = factory.Services.CreateScope())
        {
            var callbacks = scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>();
            var callback = gateway.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true);
            await callbacks.ReceiveCallbackAsync(callback, default);
            await callbacks.ReceiveCallbackAsync(callback, default);
        }
        await factory.QueryAsync(async db => {
            Assert.False(await db.Enrollments.AnyAsync(x => x.ClassId == data.Id && x.Status == EnrollmentStatus.Confirmed));
            var wallet = await db.PointWallets.SingleAsync(x => x.OwnerUserId == member.UserId);
            Assert.Equal(100, wallet.AvailablePoints);
            Assert.Equal(1, await db.PointLedgerEntries.CountAsync(x => x.WalletId == wallet.WalletId && x.ReferenceType == "GatewayCompensation"));
            return 0;
        });
    }

    [Fact]
    public async Task Manager_can_edit_coach_name_and_phone_with_unique_phone_and_fixed_role()
    {
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        await factory.QueryAsync(async db => { db.CoachProfiles.Add(new() { UserId = coach.UserId }); db.UserSportSpecialties.Add(new() { UserId = coach.UserId, SportId = 3 }); await db.SaveChangesAsync(); return 0; });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.PutAsJsonAsync($"/api/manager/coaches/{coach.UserId}", new { fullName = "Updated Coach", phone = "0912345678", sportIds = new[] { 3 }, bio = "Updated bio", role = "SYSTEM_ADMINISTRATOR" });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        await factory.QueryAsync(async db => {
            var user = await db.UserAccounts.Include(x => x.Profile).Include(x => x.Role).SingleAsync(x => x.UserId == coach.UserId);
            Assert.Equal("Updated Coach", user.Profile!.FullName); Assert.Equal("0912345678", user.Profile.Phone);
            Assert.Equal(UserRole.Coach, user.Role!.RoleName); Assert.Equal(coach.Email, user.Email); return 0;
        });
        var other = await factory.SeedUserAsync(UserRole.Coach);
        var duplicate = await client.PutAsJsonAsync($"/api/manager/coaches/{other.UserId}", new { fullName = "Another Coach", phone = "0912345678", sportIds = new[] { 3 } });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }
}
