using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Net.Http.Headers;
using System.Text;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Infrastructure.Security;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using Testcontainers.PostgreSql;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// Ha tang test cua module Training (BE-4: PT entitlement/session/homework) — cung mau voi
/// SchedulingApiFactory (PostgreSQL that qua Testcontainers, schema sinh bang chinh migration).
/// </summary>
public sealed class TrainingApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestSecretKey = "sporthub-training-tests-secret-key-64-bytes-long-enough!!!!";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("sporthub_training_tests")
        .WithUsername("sporthub")
        .WithPassword("sporthub-test-password")
        .Build();

    public JwtOptions EffectiveJwtOptions
    {
        get
        {
            var bearer = Services.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
                .Get(JwtBearerDefaults.AuthenticationScheme);

            var parameters = bearer.TokenValidationParameters;
            var key = (SymmetricSecurityKey)parameters.IssuerSigningKey;

            return new JwtOptions
            {
                Issuer = parameters.ValidIssuer,
                Audience = parameters.ValidAudience,
                SecretKey = Encoding.UTF8.GetString(key.Key),
                AccessTokenExpiryMinutes = 60
            };
        }
    }

    async Task IAsyncLifetime.InitializeAsync()
    {
        await _postgres.StartAsync();

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await db.Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = _postgres.GetConnectionString(),
                ["JwtOptions:Issuer"] = "SportHub.Api",
                ["JwtOptions:Audience"] = "SportHub.Client",
                ["JwtOptions:SecretKey"] = TestSecretKey,
                ["JwtOptions:AccessTokenExpiryMinutes"] = "60",
                ["Cors:AllowedOrigins:0"] = "http://localhost:3000"
            }));
    }

    public HttpClient CreateApiClient(Guid? actingUserId = null, UserRole? actingRole = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        if (actingUserId is not null && actingRole is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                JwtService.GenerateAccessToken(actingUserId.Value, actingRole.Value.ToString(), EffectiveJwtOptions));
        }

        return client;
    }

    public async Task<UserAccount> SeedUserAsync(UserRole role, UserStatus status = UserStatus.Active)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var roleEntity = await db.Roles.SingleAsync(r => r.RoleName == role);

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = $"{role}-{Guid.NewGuid():N}@sporthub.test",
            RoleId = roleEntity.RoleId,
            Status = status,
            CreatedAt = DateTime.UtcNow,
            Credential = new UserCredential { PasswordHash = new PasswordHasher().Hash("Str0ngPassw0rd!") },
            Profile = new UserProfile { FullName = $"Test {role}" }
        };

        db.UserAccounts.Add(user);
        await db.SaveChangesAsync();

        return user;
    }

    /// <summary>Coach voi CoachProfile.CoachCategory tuong ung — can cho moi test RBAC/authorization cua PT.</summary>
    public async Task<UserAccount> SeedCoachAsync(
        CoachCategory category,
        UserStatus status = UserStatus.Active)
    {
        var coach = await SeedUserAsync(UserRole.Coach, status);

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId, CoachCategory = category });
        await db.SaveChangesAsync();

        return coach;
    }

    public async Task<MemberPackage> SeedMemberPackageAsync(
        Guid memberId,
        MemberPackageStatus status = MemberPackageStatus.Active,
        int? remainingSessions = 10,
        DateOnly? startDate = null,
        DateOnly? endDate = null)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var catalogPackage = new MembershipPackage
        {
            Name = $"Package {Guid.NewGuid():N}",
            Price = 1_000_000m,
            DurationDays = 30,
            SessionLimit = remainingSessions
        };

        db.MembershipPackages.Add(catalogPackage);
        await db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var memberPackage = new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = memberId,
            PackageId = catalogPackage.PackageId,
            StartDate = startDate ?? today.AddDays(-1),
            EndDate = endDate ?? today.AddDays(29),
            RemainingSessions = remainingSessions,
            Status = status
        };

        db.MemberPackages.Add(memberPackage);
        await db.SaveChangesAsync();

        return memberPackage;
    }

    public async Task<T> QueryAsync<T>(Func<SportHubDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        return await query(db);
    }

    public async Task ExecuteAsync(Func<SportHubDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        await action(db);
    }
}

[CollectionDefinition(nameof(TrainingApiCollection))]
public sealed class TrainingApiCollection : ICollectionFixture<TrainingApiFactory>;
