using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>
/// Khe race check-then-insert cua BR-64: goi bi huy NGAY giua luc kiem tra va luc ghi.
///
/// Khong dung duoc test "chay song song roi hy vong trung nhip" — de flaky. Thay vao do
/// giu mot transaction khac dang UPDATE do dang: neu repository co FOR SHARE that thi
/// request PHAI bi chan cho toi khi transaction kia commit, roi thay trang thai moi va
/// tra 409. Neu bo FOR SHARE di, request se doc duoc ban chup cu (van thay Active) va
/// ghi check-in xong truoc khi transaction kia commit — test nay fail.
/// </summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class GymCheckInConcurrencyTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Check_in_waits_for_a_concurrent_package_update_and_then_refuses()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var package = await factory.SeedMemberPackageAsync(member.UserId);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        await using var blockingTransaction = await db.Database.BeginTransactionAsync();

        await db.Database.ExecuteSqlAsync(
            $"UPDATE member_packages SET status = {(int)MemberPackageStatus.Cancelled} WHERE member_package_id = {package.MemberPackageId}");

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var checkInCall = client.PostAsJsonAsync("/api/gym-checkins", new { targetMemberId = member.UserId });

        // Request phai con dang cho khoa, chua tra ve gi.
        var finishedEarly = await Task.WhenAny(checkInCall, Task.Delay(TimeSpan.FromSeconds(2)));
        Assert.NotSame(checkInCall, finishedEarly);

        await blockingTransaction.CommitAsync();

        var response = await checkInCall.WaitAsync(TimeSpan.FromSeconds(30));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var stored = await factory.QueryAsync(d =>
            d.GymCheckIns.CountAsync(c => c.MemberId == member.UserId));
        Assert.Equal(0, stored);
    }

    [Fact]
    public async Task Concurrent_check_ins_for_the_same_member_do_not_block_each_other()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);

        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        // FOR SHARE la khoa chia se: nhieu check-in cung luc van chay duoc, khong deadlock.
        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ =>
            client.PostAsJsonAsync("/api/gym-checkins", new { targetMemberId = member.UserId })));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));

        var stored = await factory.QueryAsync(d =>
            d.GymCheckIns.CountAsync(c => c.MemberId == member.UserId));
        Assert.Equal(5, stored);
    }
}
