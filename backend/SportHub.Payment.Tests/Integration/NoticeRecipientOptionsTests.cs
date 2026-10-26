using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class NoticeRecipientOptionsTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Recipient_directory_filters_roles_names_active_enrollments_and_specialties_before_paging()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var ended = await factory.SeedUserAsync(UserRole.Member);
        var inactive = await factory.SeedUserAsync(UserRole.Member, UserStatus.Deactivated);
        var marker = "Recipient-" + Guid.NewGuid().ToString("N");
        var ids = new[] { manager.UserId, admin.UserId, desk.UserId, coach.UserId, member.UserId, ended.UserId, inactive.UserId };
        var classId = await factory.QueryAsync(async db =>
        {
            foreach (var profile in await db.Set<UserProfile>().Where(p => ids.Contains(p.UserId)).ToListAsync())
                profile.FullName = marker + " " + profile.UserId;
            var roomId = await db.Rooms.Select(r => r.RoomId).FirstAsync();
            var course = new Class { Code = marker, Name = marker, SportId = 3, CoachId = coach.UserId,
                DefaultRoomId = roomId, Status = ClassStatus.InProgress, Capacity = 10, Price = 100_000m,
                NumSessions = 1, StartDate = DateOnly.FromDateTime(DateTime.UtcNow), CreatedAt = DateTime.UtcNow };
            db.Classes.Add(course);
            db.Set<UserSportSpecialty>().Add(new() { UserId = coach.UserId, SportId = 3 });
            await db.SaveChangesAsync();
            foreach (var id in new[] { member.UserId, ended.UserId, inactive.UserId })
                db.Enrollments.Add(new() { EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId, MemberId = id,
                    Status = EnrollmentStatus.Confirmed, EnrolledAt = DateTime.UtcNow,
                    EndedAt = id == ended.UserId ? DateTime.UtcNow : null });
            await db.SaveChangesAsync();
            return course.ClassId;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        const string endpoint = "/api/manager/notices/recipient-options";
        foreach (var (role, id) in new[] { ("SYSTEM_ADMINISTRATOR", admin.UserId), ("CENTER_MANAGER", manager.UserId),
            ("RECEPTIONIST", desk.UserId), ("COACH", coach.UserId) })
        {
            var result = await client.GetFromJsonAsync<JsonElement>($"{endpoint}?role={role}&keyword={marker}");
            Assert.Equal(1, result.GetProperty("totalCount").GetInt32());
            Assert.Equal(id, result.GetProperty("items")[0].GetProperty("userId").GetGuid());
        }
        var members = await client.GetFromJsonAsync<JsonElement>($"{endpoint}?role=MEMBER&keyword={marker}&classId={classId}&pageSize=1");
        Assert.Equal(1, members.GetProperty("totalCount").GetInt32());
        Assert.Equal(member.UserId, members.GetProperty("items")[0].GetProperty("userId").GetGuid());
        var allMembers = await client.GetFromJsonAsync<JsonElement>($"{endpoint}?role=MEMBER&keyword={marker}&pageSize=1");
        Assert.Equal(2, allMembers.GetProperty("totalCount").GetInt32());
        Assert.Single(allMembers.GetProperty("items").EnumerateArray());
        var coaches = await client.GetFromJsonAsync<JsonElement>($"{endpoint}?role=COACH&keyword={marker}&sportId=3");
        Assert.Equal(1, coaches.GetProperty("totalCount").GetInt32());
        var wrongSpecialty = await client.GetFromJsonAsync<JsonElement>($"{endpoint}?role=COACH&keyword={marker}&sportId=2");
        Assert.Equal(0, wrongSpecialty.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(endpoint + "?role=COACH&classId=1")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(endpoint + "?role=INVALID")).StatusCode);
        var filters = await client.GetFromJsonAsync<JsonElement>("/api/manager/notices/recipient-filters");
        Assert.Contains(filters.GetProperty("classes").EnumerateArray(), c => c.GetProperty("classId").GetInt32() == classId);
        using var reception = factory.CreateApiClient(desk.UserId, UserRole.Receptionist);
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        foreach (var restricted in new[] { reception, owner })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await restricted.GetAsync(endpoint + "?role=MEMBER")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await restricted.GetAsync("/api/manager/notices/recipient-filters")).StatusCode);
        }
    }
}
