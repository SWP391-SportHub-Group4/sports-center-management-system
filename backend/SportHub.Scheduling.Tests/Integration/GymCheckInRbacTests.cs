using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>
/// Phan quyen Gym check-in (Design v2 §5, ma tran RBAC — dong "Ghi nhan Gym Check-in"
/// va "Xem lich su Gym Check-in"). Chot ro rang khong tai dung AttendanceCheckInPolicy:
/// Coach phai bi tu choi o day trong khi policy do van cho Coach.
/// </summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class GymCheckInRbacTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Only_receptionist_can_record_a_check_in(UserRole role)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        await factory.SeedMemberPackageAsync(member.UserId);
        var caller = await factory.SeedUserAsync(role);

        var client = factory.CreateApiClient(caller.UserId, role);

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_callers_are_rejected()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Member_reads_only_their_own_history()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var otherMember = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(otherMember.UserId);

        var receptionistClient = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        await receptionistClient.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = otherMember.UserId });

        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);

        // Route /me lay id tu JWT nen chi tra ve lich su cua chinh nguoi goi.
        var own = await memberClient.GetAsync("/api/members/me/gym-checkins");
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        var ownBody = await own.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, ownBody.GetProperty("totalCount").GetInt32());

        // Va khong voi toi duoc endpoint tra cuu theo id cua nguoi khac.
        var foreign = await memberClient.GetAsync($"/api/members/{otherMember.UserId}/gym-checkins");
        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.CenterManager)]
    public async Task Receptionist_and_manager_can_look_up_a_member_history(UserRole role)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);

        var receptionistClient = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        await receptionistClient.PostAsJsonAsync(
            "/api/gym-checkins",
            new { targetMemberId = member.UserId });

        var caller = await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(caller.UserId, role);

        var response = await client.GetAsync($"/api/members/{member.UserId}/gym-checkins");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, body.GetProperty("totalCount").GetInt32());
    }

    // Manager chi duoc doc: khong duoc phep ghi (da chot o test Only_receptionist_...
    // ben tren) — day la chieu con lai, xac nhan quyen doc that su ton tai.
    [Theory]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Coach_and_system_administrator_cannot_look_up_histories(UserRole role)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var caller = await factory.SeedUserAsync(role);

        var client = factory.CreateApiClient(caller.UserId, role);

        var response = await client.GetAsync($"/api/members/{member.UserId}/gym-checkins");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
