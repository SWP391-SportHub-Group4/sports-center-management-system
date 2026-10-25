using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class IncidentRefundTests(PaymentApiFactory factory)
{
    private static int dateOffset;
    private sealed record Fixture(Guid Member, Guid Manager, Guid Pass, Guid Rental, Guid PassItem, Guid RentalItem, IncidentRequest Window);

    private async Task<Fixture> SeedAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        return await factory.QueryAsync(async db =>
        {
            var day = VietnamTime.TodayLocal(new SystemClock()).AddDays(-100 - Interlocked.Increment(ref dateOffset));
            var start = VietnamTime.StartOfDayUtc(day).AddHours(8);
            var typeId = await db.Set<SportRoomType>().Join(db.Set<Sport>().Where(s => s.Code == "gym"),
                l => l.SportId, s => s.SportId, (l, s) => l.RoomTypeId).FirstAsync();
            var room = new Room { Name = "Incident refund " + Guid.NewGuid(), Capacity = 12, RoomTypeId = typeId };
            db.Rooms.Add(room);
            var pass = new MemberPackage { MemberPackageId = Guid.NewGuid(), MemberId = member.UserId, PackageId = DayPass.PackageId,
                StartDate = day, EndDate = day, ExpiresAtUtc = start.AddHours(14), Status = MemberPackageStatus.Expired };
            db.MemberPackages.Add(pass);
            await db.SaveChangesAsync();
            var rental = new CourtRental { CourtRentalId = Guid.NewGuid(), MemberId = member.UserId, RoomId = room.RoomId,
                SportId = 3, StartAtUtc = start, EndAtUtc = start.AddHours(2), TotalPrice = 200000,
                Status = CourtRentalStatus.Completed, CreatedAtUtc = start.AddDays(-2) };
            db.Set<CourtRental>().Add(rental);
            var invoice = new Invoice { InvoiceId = Guid.NewGuid(), InvoiceNumber = "IR-" + Guid.NewGuid().ToString("N")[..16],
                MemberId = member.UserId, IssuedByUserId = manager.UserId, TotalAmount = 250000, CashAmount = 250000,
                Status = InvoiceStatus.Paid, PaidVia = "VnPay", IssuedAt = start.AddDays(-2), PaidAtUtc = start.AddDays(-2) };
            var passItem = new InvoiceItem { ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.Membership,
                Description = "Gym day pass", UnitPrice = 50000, Quantity = 1, LineAmount = 50000, RelatedEntityId = pass.MemberPackageId };
            var rentalItem = new InvoiceItem { ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.Rental,
                Description = "Court rental", UnitPrice = 200000, Quantity = 1, LineAmount = 200000, RelatedEntityId = rental.CourtRentalId };
            invoice.Items.Add(passItem); invoice.Items.Add(rentalItem);
            db.Invoices.Add(invoice);
            db.Payments.Add(new SportHub.Payment.Domain.Entities.Payment { PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                Amount = 250000, Method = PaymentMethod.VnPay, Status = PaymentStatus.Success,
                ReceivedByUserId = manager.UserId, ReferenceCode = Guid.NewGuid().ToString("N"), PaidAt = start.AddDays(-2) });
            db.GymCheckIns.Add(new GymCheckIn { CheckInId = Guid.NewGuid(), MemberId = member.UserId,
                CheckedInByUserId = manager.UserId, CheckInTime = start.AddMinutes(5) });
            await db.SaveChangesAsync();
            pass.InvoiceItemId = passItem.ItemId; rental.InvoiceItemId = rentalItem.ItemId; rental.InvoiceId = invoice.InvoiceId;
            await db.SaveChangesAsync();
            return new Fixture(member.UserId, manager.UserId, pass.MemberPackageId, rental.CourtRentalId,
                passItem.ItemId, rentalItem.ItemId, new("Center", null, start, start.AddHours(2), "Power failure affected all services"));
        });
    }

    private async Task<IncidentPreviewResponse> Preview(IncidentRequest request)
    { using var scope = factory.Services.CreateScope(); return await scope.ServiceProvider.GetRequiredService<IncidentService>().PreviewAsync(request); }
    private async Task<Guid> Resolve(IncidentRequest request, Guid manager)
    { using var scope = factory.Services.CreateScope(); return await scope.ServiceProvider.GetRequiredService<IncidentService>().ResolveAsync(request, manager); }
    private static IncidentRequest Confirm(IncidentRequest request, IncidentPreviewResponse preview)
        => request with { OperationId = Guid.NewGuid(), PreviewToken = preview.PreviewToken,
            Refunds = preview.Refunds.Select(r => new IncidentRefundSelection(r.SourceId, r.SuggestedRefundPoints)).ToList() };

    [Fact]
    public async Task Checked_in_day_pass_and_historical_rental_refund_once_and_keep_receipts()
    {
        var f = await SeedAsync(); var preview = await Preview(f.Window);
        Assert.Equal(2, preview.Refunds.Count);
        Assert.Contains(preview.Refunds, r => r.SourceId == f.Pass && r.Status == "CheckInRecorded" && r.SuggestedRefundPoints == 50);
        Assert.Contains(preview.Refunds, r => r.SourceId == f.Rental && r.SuggestedRefundPoints == 200);
        var request = Confirm(f.Window, preview);
        var id = await Resolve(request, f.Manager);
        Assert.Equal(id, await Resolve(request, f.Manager));
        Assert.Equal(250, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == f.Member).Select(w => w.AvailablePoints).SingleAsync()));
        Assert.Equal(MemberPackageStatus.Cancelled, await factory.QueryAsync(db => db.MemberPackages.Where(p => p.MemberPackageId == f.Pass).Select(p => p.Status).SingleAsync()));
        using var scope = factory.Services.CreateScope();
        var receipt = await scope.ServiceProvider.GetRequiredService<IncidentService>().GetAsync(id);
        Assert.Equal(250, receipt.Refunds!.Sum(r => r.Points));
        Assert.Equal(4, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == f.Member && receipt.Refunds!.Select(r => r.NotificationSourceId).Contains(n.SourceEntityId!.Value))));
        var overlap = await Preview(f.Window);
        Assert.All(overlap.Refunds, row => Assert.Equal(0, row.MaximumRefundPoints));
        await Resolve(Confirm(f.Window, overlap), f.Manager);
        Assert.Equal(250, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == f.Member).Select(w => w.AvailablePoints).SingleAsync()));
    }

    [Fact]
    public async Task Partial_refund_needs_reason_and_overlap_only_refunds_remaining_balance()
    {
        var f = await SeedAsync(); var preview = await Preview(f.Window);
        var request = Confirm(f.Window, preview);
        request = request with { Refunds = request.Refunds!.Select(r => r.SourceId == f.Rental ? r with { Points = 50 } : r).ToList() };
        Assert.Equal("incident_refund_reason_required", (await Assert.ThrowsAsync<BadRequestException>(() => Resolve(request, f.Manager))).ErrorCode);
        request = request with { Refunds = request.Refunds!.Select(r => r.SourceId == f.Rental ? r with { AdjustmentReason = "Member used part of the booked time" } : r).ToList() };
        await Resolve(request, f.Manager);
        Assert.Equal("incident_refund_preview_changed", (await Assert.ThrowsAsync<ConflictException>(() => Resolve(Confirm(f.Window, preview), f.Manager))).ErrorCode);
        var second = await Preview(f.Window);
        Assert.Equal(150, second.Refunds.Single(r => r.SourceId == f.Rental).MaximumRefundPoints);
        Assert.Equal(50, second.Refunds.Single(r => r.SourceId == f.Rental).RefundedPoints);
        await Resolve(Confirm(f.Window, second), f.Manager);
        Assert.Equal(250, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == f.Member).Select(w => w.AvailablePoints).SingleAsync()));
    }

    [Fact]
    public async Task Excessive_points_and_unreviewed_requests_are_rejected_without_credits()
    {
        var f = await SeedAsync(); var preview = await Preview(f.Window);
        Assert.Equal("incident_refund_preview_changed", (await Assert.ThrowsAsync<ConflictException>(() => Resolve(f.Window, f.Manager))).ErrorCode);
        var request = Confirm(f.Window, preview) with { Refunds = preview.Refunds.Select(r => new IncidentRefundSelection(r.SourceId, 9999, "Extra compensation")).ToList() };
        Assert.Equal("incident_refund_points_invalid", (await Assert.ThrowsAsync<BadRequestException>(() => Resolve(request, f.Manager))).ErrorCode);
        Assert.False(await factory.QueryAsync(db => db.PointLedgerEntries.AnyAsync(e => e.InvoiceItemId == f.PassItem || e.InvoiceItemId == f.RentalItem)));
    }

    [Fact]
    public async Task Concurrent_incidents_cannot_both_credit_the_same_paid_value()
    {
        var f = await SeedAsync(); var preview = await Preview(f.Window);
        async Task<bool> TryResolve(IncidentRequest request)
        { try { await Resolve(request, f.Manager); return true; } catch (ConflictException) { return false; } }
        var results = await Task.WhenAll(TryResolve(Confirm(f.Window, preview)), TryResolve(Confirm(f.Window, preview)));
        Assert.Single(results, success => success);
        Assert.Equal(250, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == f.Member).Select(w => w.AvailablePoints).SingleAsync()));
    }

    [Fact]
    public async Task Service_date_scope_and_long_term_memberships_are_respected()
    {
        var f = await SeedAsync();
        var membership = await factory.SeedPendingPackageAsync(f.Member, durationDays: 30);
        var day = DateOnly.FromDateTime(VietnamTime.ToLocal(f.Window.StartAtUtc));
        await factory.QueryAsync(async db => {
            await db.MemberPackages.Where(p => p.MemberPackageId == membership.MemberPackage.MemberPackageId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, MemberPackageStatus.Active)
                    .SetProperty(p => p.StartDate, day).SetProperty(p => p.EndDate, day.AddDays(29)));
            return 0;
        });
        var unrelatedDay = await Preview(f.Window with { StartAtUtc = f.Window.StartAtUtc.AddDays(-5), EndAtUtc = f.Window.EndAtUtc.AddDays(-5) });
        Assert.DoesNotContain(unrelatedDay.Refunds, r => r.SourceId == f.Pass || r.SourceId == f.Rental);
        var nonGymRoom = await factory.QueryAsync(async db => {
            var room = new Room { Name = "Other court " + Guid.NewGuid(), Capacity = 12, RoomTypeId = 3 };
            db.Rooms.Add(room); await db.SaveChangesAsync(); return room.RoomId;
        });
        var scoped = await Preview(f.Window with { Scope = "Room", RoomId = nonGymRoom });
        Assert.DoesNotContain(scoped.Refunds, r => r.SourceType == "GymDayPass");
        var preview = await Preview(f.Window);
        Assert.DoesNotContain(preview.Refunds, r => r.SourceId == membership.MemberPackage.MemberPackageId);
        await Resolve(Confirm(f.Window, preview), f.Manager);
        var retained = await factory.QueryAsync(db => db.MemberPackages.SingleAsync(p => p.MemberPackageId == membership.MemberPackage.MemberPackageId));
        Assert.Equal(MemberPackageStatus.Active, retained.Status);
        Assert.Equal(day.AddDays(29), retained.EndDate);
    }

    [Fact]
    public async Task Reusing_a_confirmation_with_different_details_is_rejected()
    {
        var f = await SeedAsync();
        var request = Confirm(f.Window, await Preview(f.Window));
        await Resolve(request, f.Manager);
        var changed = request with { Reason = "Different details using the same confirmation" };
        Assert.Equal("incident_operation_conflict", (await Assert.ThrowsAsync<ConflictException>(() => Resolve(changed, f.Manager))).ErrorCode);
        Assert.Equal(250, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == f.Member).Select(w => w.AvailablePoints).SingleAsync()));
    }
}
