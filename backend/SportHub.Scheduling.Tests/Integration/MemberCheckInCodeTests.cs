using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>Mã QR check-in do server cấp và ký; client không tự dựng được và mã hết hạn cuối ngày giờ VN.</summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class MemberCheckInCodeTests(SchedulingApiFactory factory)
{
    private static MemberCheckInCodeService Service(DateTime utcNow, string secret = "unit-test-secret-key-with-at-least-32-chars")
        => new(Options.Create(new JwtOptions { SecretKey = secret }), new TestClock(utcNow));

    [Fact]
    public void Issued_code_resolves_to_the_member_until_the_end_of_the_vietnam_day()
    {
        var memberId = Guid.NewGuid();
        // 10:00 giờ VN ngày 13/10 = 03:00 UTC; hết hạn lúc 00:00 giờ VN ngày 14/10 = 17:00 UTC.
        var morning = new DateTime(2026, 10, 13, 3, 0, 0, DateTimeKind.Utc);
        var issued = Service(morning).Issue(memberId);
        Assert.Equal(new DateTime(2026, 10, 13, 17, 0, 0, DateTimeKind.Utc), issued.ExpiresAtUtc);

        Assert.Equal(memberId, Service(morning.AddHours(10)).Resolve(issued.Code));
        var expired = Assert.Throws<ConflictException>(() =>
            Service(new DateTime(2026, 10, 13, 17, 0, 1, DateTimeKind.Utc)).Resolve(issued.Code));
        Assert.Equal("checkin_code_expired", expired.ErrorCode);
    }

    [Fact]
    public void Forged_or_foreign_codes_are_rejected()
    {
        var now = new DateTime(2026, 10, 13, 3, 0, 0, DateTimeKind.Utc);
        var code = Service(now).Issue(Guid.NewGuid()).Code;

        // Sửa memberId, giữ chữ ký cũ.
        var parts = code[MemberCheckInCodeService.Prefix.Length..].Split('.');
        var swapped = $"{MemberCheckInCodeService.Prefix}{Guid.NewGuid():N}.{parts[1]}.{parts[2]}";
        foreach (var bad in new[] { swapped, "SPORTHUB-MEMBER:" + Guid.NewGuid(), Guid.NewGuid().ToString(), "", null })
            Assert.Equal("checkin_code_invalid",
                Assert.Throws<BadRequestException>(() => Service(now).Resolve(bad)).ErrorCode);

        // Mã ký bằng khóa khác.
        Assert.Throws<BadRequestException>(() =>
            Service(now, "another-secret-key-with-at-least-32-chars!").Resolve(code));
    }

    [Fact]
    public async Task Member_gets_a_code_and_front_desk_resolves_it_but_other_roles_cannot()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var issued = await memberClient.GetAsync("/api/members/me/checkin-code");
        Assert.Equal(HttpStatusCode.OK, issued.StatusCode);
        var code = (await issued.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

        var receptionist = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Receptionist)).UserId, UserRole.Receptionist);
        var resolved = await receptionist.PostAsJsonAsync("/api/members/checkin-code/resolve", new { code });
        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        Assert.Equal(member.UserId,
            (await resolved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid());

        var forged = await receptionist.PostAsJsonAsync("/api/members/checkin-code/resolve",
            new { code = $"{MemberCheckInCodeService.Prefix}{Guid.NewGuid():N}.9999999999.x" });
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync("/api/members/checkin-code/resolve", new { code })).StatusCode);
        var coach = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Coach)).UserId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await coach.GetAsync("/api/members/me/checkin-code")).StatusCode);
    }
}
