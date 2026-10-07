using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class ManagerAuditDisplayTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Current_names_are_page_scoped_and_never_replace_event_values_even_for_missing_targets()
    {
        var actor = await factory.SeedUserAsync($"audit-display-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var coach = await factory.SeedUserAsync($"audit-coach-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach, fullName: "Coach Display Name");
        var action = $"DISPLAY_{Guid.NewGuid():N}";
        int sportId, roomId;
        var auditId = Guid.NewGuid();
        string recorded;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var sport = new Sport { Code = "audit_" + Guid.NewGuid().ToString("N"), Name = "Current sport " + Guid.NewGuid(), IsActive = false };
            var type = new RoomType { Name = "Audit type " + Guid.NewGuid() };
            db.AddRange(sport, type); await db.SaveChangesAsync();
            var room = new Room { Name = "Audit room " + Guid.NewGuid(), Capacity = 20, RoomTypeId = type.RoomTypeId };
            db.Add(room); await db.SaveChangesAsync();
            sportId = sport.SportId; roomId = room.RoomId;
            recorded = JsonSerializer.Serialize(new { name = "Recorded old sport", sportId, roomId, coachId = coach.UserId, password = "DO_NOT_RESOLVE" });
            db.AuditLogs.Add(new AuditLog { AuditId = auditId, UserId = actor.UserId, Action = action, TargetEntity = "Sport", TargetId = sportId.ToString(), NewValue = recorded, Timestamp = DateTime.UtcNow });
            // Trigger every supported query shape, including missing/deleted targets.
            foreach (var entity in new[] { "Room", "RoomType", "MembershipPackage", "Class", "SportServiceOffering", "CourtRate", "ClassSession", "RoomBlock", "IncidentNotice", "Invoice", "InvoiceItem", "PaymentAdjustment", "MemberPackage", "PtEntitlement", "PtSession", "PtCoachChangeRequest", "PtSessionChangeRequest", "CoachMemberRelationship", "ReportExport", "PointWallet", "CoachServiceQualification", "UnknownFutureEntity" })
            {
                var id = entity is "Room" ? roomId.ToString() : entity is "RoomType" ? type.RoomTypeId.ToString() : entity is "Class" or "MembershipPackage" or "SportServiceOffering" or "CourtRate" ? int.MaxValue.ToString() : entity is "PointWallet" or "CoachServiceQualification" ? coach.UserId.ToString().ToUpperInvariant() : Guid.NewGuid().ToString();
                db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = actor.UserId, Action = action, TargetEntity = entity, TargetId = id, Timestamp = DateTime.UtcNow });
            }
            db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = actor.UserId, Action = action, TargetEntity = "Sport", TargetId = "bad-id", OldValue = "{\"name\":\"Deleted historical sport\"}", NewValue = "\"malformed\"", Timestamp = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(actor.UserId, UserRole.CenterManager));
        var result = (await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}&pageSize=200"))!;
        Assert.Equal(24, result.TotalCount);
        var row = Assert.Single(result.Items, r => r.AuditId == auditId);
        Assert.StartsWith("Current sport", row.CurrentTargetLabel);
        using var expectedJson = JsonDocument.Parse(recorded);
        using var actualJson = JsonDocument.Parse(row.NewValue!);
        Assert.True(JsonElement.DeepEquals(expectedJson.RootElement, actualJson.RootElement));
        Assert.Equal("Coach Display Name", row.ReferenceNames![$"UserAccount:{coach.UserId}"]);
        Assert.Contains($"Room:{roomId}", row.ReferenceNames.Keys);
        Assert.DoesNotContain("DO_NOT_RESOLVE", row.ReferenceNames.Values);
        var missing = Assert.Single(result.Items, r => r.TargetId == "bad-id");
        Assert.Null(missing.CurrentTargetLabel);
        Assert.Empty(missing.ReferenceNames!);
        var wallet = Assert.Single(result.Items, r => r.TargetEntity == "PointWallet");
        Assert.Equal("Coach Display Name", wallet.CurrentTargetLabel);
        Assert.DoesNotContain($"Sport:{sportId}", wallet.ReferenceNames!.Keys);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            (await db.Set<Sport>().SingleAsync(s => s.SportId == sportId)).Name = "Renamed current sport " + Guid.NewGuid();
            await db.SaveChangesAsync();
        }
        var refreshed = Assert.Single((await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}&targetEntity=Sport&targetId={sportId}"))!.Items);
        Assert.StartsWith("Renamed current sport", refreshed.CurrentTargetLabel);
        Assert.Equal(row.NewValue, refreshed.NewValue);
        Assert.Equal(row.TargetId, refreshed.TargetId);
    }

    [Fact]
    public async Task Sport_and_facility_operations_record_identity_capacity_hours_and_deleted_block_times()
    {
        var actor = await factory.SeedUserAsync($"audit-operation-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(actor.UserId, UserRole.CenterManager));
        var name = "Snapshot sport " + Guid.NewGuid();
        object Payload(int capacity) => new { code = "sport_" + actor.UserId.ToString("N")[..12], name, description = "Recorded description", services = new[] { new { serviceType = "GROUP_COURSE", isEnabled = true, defaultSessionMinutes = 90, defaultMaxCapacity = capacity } } };
        var create = await client.PostAsJsonAsync("api/manager/sports", Payload(12));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var sportId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sportId").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"api/manager/sports/{sportId}", Payload(18))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"api/manager/sports/{sportId}/deactivate", null)).StatusCode);
        var roomResponse = await client.PostAsJsonAsync("api/rooms", new { name = "Snapshot room " + Guid.NewGuid(), capacity = 20 });
        Assert.Equal(HttpStatusCode.Created, roomResponse.StatusCode);
        var room = await roomResponse.Content.ReadFromJsonAsync<JsonElement>();
        var roomId = room.GetProperty("roomId").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"api/manager/rooms/{roomId}/opening-hours", new { hours = new[] { new { dayOfWeek = 1, openTimeLocal = "06:00", closeTimeLocal = "22:00" } } })).StatusCode);
        var start = DateTime.UtcNow.Date.AddDays(200).AddHours(3);
        var blockResponse = await client.PostAsJsonAsync("api/manager/room-blocks", new { roomId, startAtUtc = start, endAtUtc = start.AddHours(1), reason = "Audit maintenance" });
        Assert.Equal(HttpStatusCode.Created, blockResponse.StatusCode);
        var blockId = (await blockResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("blockId").GetGuid();
        Assert.True((await client.DeleteAsync($"api/manager/room-blocks/{blockId}")).IsSuccessStatusCode);
        var logs = (await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?actorId={actor.UserId}&pageSize=200"))!.Items;
        using var update = JsonDocument.Parse(Assert.Single(logs, r => r.Action == "UPDATE_SPORT").NewValue!);
        Assert.Equal(18, update.RootElement.GetProperty("services")[0].GetProperty("defaultMaxCapacity").GetInt32());
        using var deactivate = JsonDocument.Parse(Assert.Single(logs, r => r.Action == "DEACTIVATE_SPORT").NewValue!);
        Assert.Equal(name, deactivate.RootElement.GetProperty("name").GetString());
        using var hours = JsonDocument.Parse(Assert.Single(logs, r => r.Action == "SET_ROOM_OPENING_HOURS").NewValue!);
        Assert.Equal(room.GetProperty("name").GetString(), hours.RootElement.GetProperty("name").GetString());
        Assert.Equal("1:06:00-22:00", hours.RootElement.GetProperty("hours")[0].GetString());
        var deleted = Assert.Single(logs, r => r.Action == "DELETE_ROOM_BLOCK");
        Assert.Null(deleted.CurrentTargetLabel);
        using var block = JsonDocument.Parse(deleted.OldValue!);
        Assert.Equal(room.GetProperty("name").GetString(), block.RootElement.GetProperty("targetName").GetString());
        Assert.Equal(start, block.RootElement.GetProperty("startAtUtc").GetDateTime());
        Assert.Equal(start.AddHours(1), block.RootElement.GetProperty("endAtUtc").GetDateTime());
    }
}
