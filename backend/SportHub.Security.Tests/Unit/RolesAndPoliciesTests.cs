using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Extensions;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Unit;

public class RolesAndPoliciesTests
{
    private static IEnumerable<string> Constants(Type t) =>
        t.GetFields().Where(f => f.IsLiteral).Select(f => (string)f.GetRawConstantValue()!);

    [Fact]
    public void Role_names_mirror_UserRole_enum()
    {
        Assert.Equal(
            Enum.GetNames<UserRole>().OrderBy(x => x),
            Constants(typeof(SportHubRoleNames)).OrderBy(x => x));
    }

    [Fact]
    public void Role_numbers_are_unchanged_and_there_are_exactly_five_roles()
    {
        Assert.Equal(0, (int)UserRole.CenterManager);
        Assert.Equal(1, (int)UserRole.Coach);
        Assert.Equal(2, (int)UserRole.Member);
        Assert.Equal(3, (int)UserRole.Receptionist);
        Assert.Equal(4, (int)UserRole.SystemAdministrator);
        Assert.Equal(5, Enum.GetValues<UserRole>().Length); // BR-140: không còn ExternalCoach
    }

    [Fact]
    public async Task Every_declared_policy_is_registered()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSportHubAuthorizationPolicies();
        var provider = services.BuildServiceProvider().GetRequiredService<IAuthorizationPolicyProvider>();

        foreach (var name in Constants(typeof(SportHubPolicies)))
            Assert.NotNull(await provider.GetPolicyAsync(name));
    }
}
