using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class InvoiceServiceImagesTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Invoice_images_resolve_in_bulk_for_the_beneficiary_without_mutating_rows_or_leaking_other_members_services()
    {
        var member = await factory.SeedUserAsync($"invoice-image-{Guid.NewGuid():N}@example.com", null);
        var other = await factory.SeedUserAsync($"invoice-image-{Guid.NewGuid():N}@example.com", null);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var package = new MembershipPackage { Name = "Invoice photo package " + Guid.NewGuid(), Price = 10000, DurationDays = 30 };
        var room = new Room { Name = "Invoice photo room " + Guid.NewGuid(), Capacity = 12, AllowRental = true };
        var sport = new Sport { Code = "INVOICE-PHOTO-" + Guid.NewGuid().ToString("N"), Name = "Invoice photo sport " + Guid.NewGuid() };
        db.AddRange(package, room, sport);
        await db.SaveChangesAsync();
        var course = new Class { Code = "INVOICE-PHOTO-" + Guid.NewGuid().ToString("N"), Name = "Invoice photo class", SportId = sport.SportId,
            DefaultRoomId = room.RoomId, StartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)), NumSessions = 8,
            Capacity = 12, Price = 10000, Status = ClassStatus.Published, CreatedAt = DateTime.UtcNow };
        db.Classes.Add(course);
        var ownedPackages = Enumerable.Range(0, 2).Select(_ => new MemberPackage {
            MemberPackageId = Guid.NewGuid(), MemberId = member.UserId, PackageId = package.PackageId,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow), EndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30))
        }).ToArray();
        var foreignPackage = new MemberPackage { MemberPackageId = Guid.NewGuid(), MemberId = other.UserId, PackageId = package.PackageId,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow), EndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) };
        CourtRental Rental(Guid owner) => new() { CourtRentalId = Guid.NewGuid(), MemberId = owner, SportId = sport.SportId,
            RoomId = room.RoomId, StartAtUtc = DateTime.UtcNow.AddDays(10), EndAtUtc = DateTime.UtcNow.AddDays(10).AddHours(1),
            CreatedAtUtc = DateTime.UtcNow, TotalPrice = 10000, Status = CourtRentalStatus.PendingPayment };
        var ownedRentals = Enumerable.Range(0, 2).Select(_ => Rental(member.UserId)).ToArray();
        var foreignRental = Rental(other.UserId);
        db.MemberPackages.AddRange(ownedPackages.Append(foreignPackage));
        db.CourtRentals.AddRange(ownedRentals.Append(foreignRental));
        await db.SaveChangesAsync();
        var invoice = new Invoice { InvoiceId = Guid.NewGuid(), InvoiceNumber = "PHOTO-" + Guid.NewGuid().ToString("N"),
            MemberId = member.UserId, IssuedByUserId = member.UserId, TotalAmount = 60000, Status = InvoiceStatus.Issued, IssuedAt = DateTime.UtcNow };
        InvoiceItem Item(InvoiceItemType type, string description) => new() { ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
            ItemType = type, Description = description, Quantity = 1, UnitPrice = 10000, LineAmount = 10000 };
        var classItem = Item(InvoiceItemType.ClassPackage, "Stored class snapshot"); classItem.ClassId = course.ClassId;
        var membershipItem = Item(InvoiceItemType.Membership, "Stored membership snapshot"); membershipItem.MemberPackageId = ownedPackages[0].MemberPackageId;
        var rentalItem = Item(InvoiceItemType.Rental, "Stored rental snapshot"); rentalItem.CourtRentalId = ownedRentals[0].CourtRentalId;
        var wrongMembership = Item(InvoiceItemType.Membership, "Foreign package snapshot"); wrongMembership.MemberPackageId = foreignPackage.MemberPackageId;
        var wrongRental = Item(InvoiceItemType.Rental, "Foreign rental snapshot"); wrongRental.CourtRentalId = foreignRental.CourtRentalId;
        var legacy = Item(InvoiceItemType.Membership, "Legacy snapshot");
        var items = new[] { classItem, membershipItem, rentalItem, wrongMembership, wrongRental, legacy };
        invoice.Items = items;
        db.Invoices.Add(invoice);
        await db.SaveChangesAsync();
        var before = await db.InvoiceItems.AsNoTracking().Where(x => x.InvoiceId == invoice.InvoiceId)
            .ToDictionaryAsync(x => x.ItemId, x => x.Description);

        // Two collection queries resolve any number of package/rental IDs; all reads remain untracked.
        var counter = new QueryCounter();
        await using (var reading = new SportHubDbContext(new DbContextOptionsBuilder<SportHubDbContext>()
            .UseNpgsql(db.Database.GetDbConnection()).UseSnakeCaseNamingConvention().AddInterceptors(counter).Options))
        {
            var resolved = await new InvoiceServiceImageReader(reading).GetReferencesAsync(member.UserId,
                ownedPackages.Append(foreignPackage).Select(x => x.MemberPackageId).ToArray(),
                ownedRentals.Append(foreignRental).Select(x => x.CourtRentalId).ToArray());
            Assert.Equal(2, counter.Reads);
            Assert.Equal(2, resolved.MembershipPackages.Count);
            Assert.Equal(2, resolved.RentalRooms.Count);
            Assert.DoesNotContain(foreignPackage.MemberPackageId, resolved.MembershipPackages.Keys);
            Assert.DoesNotContain(foreignRental.CourtRentalId, resolved.RentalRooms.Keys);
            Assert.Empty(reading.ChangeTracker.Entries());
        }
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(member.UserId, UserRole.Member));
        var response = await client.GetAsync($"/api/invoices/{invoice.InvoiceId}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var detail = await response.Content.ReadFromJsonAsync<JsonElement>();
        var returned = detail.GetProperty("items").EnumerateArray().ToDictionary(x => x.GetProperty("itemId").GetGuid());
        foreach (var (item, kind, serviceId) in new[] { (classItem, "class", course.ClassId), (membershipItem, "membership", package.PackageId), (rentalItem, "room", room.RoomId) })
        {
            Assert.Equal(kind, returned[item.ItemId].GetProperty("serviceImageKind").GetString());
            Assert.Equal(serviceId, returned[item.ItemId].GetProperty("serviceImageId").GetInt32());
        }
        foreach (var item in new[] { wrongMembership, wrongRental, legacy })
        {
            Assert.Equal(JsonValueKind.Null, returned[item.ItemId].GetProperty("serviceImageKind").ValueKind);
            Assert.Equal(JsonValueKind.Null, returned[item.ItemId].GetProperty("serviceImageId").ValueKind);
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(other.UserId, UserRole.Member));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/invoices/{invoice.InvoiceId}")).StatusCode);
        var after = await db.InvoiceItems.AsNoTracking().Where(x => x.InvoiceId == invoice.InvoiceId).ToDictionaryAsync(x => x.ItemId, x => x.Description);
        Assert.Equal(before.OrderBy(x => x.Key), after.OrderBy(x => x.Key));
    }

    private sealed class QueryCounter : DbCommandInterceptor
    {
        public int Reads { get; private set; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Reads++;
            return ValueTask.FromResult(result);
        }
    }
}
