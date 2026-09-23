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

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>
/// Ha tang test cua module Scheduling — dung mau cua SportHub.Security.Tests
/// (PostgreSQL that qua Testcontainers, schema sinh bang chinh migration cua project)
/// nhung la bo test RIENG: nghiep vu Gym khong nhet vao bo test bao mat.
///
/// Phai la PostgreSQL that chu khong phai in-memory: nhung thu dang kiem chung o day
/// (FK restrict, CHECK constraint, transaction + FOR SHARE) chi ton tai o tang DB.
/// </summary>
public sealed class SchedulingApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestSecretKey = "sporthub-scheduling-tests-secret-key-64-bytes-long-enough!!!";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("sporthub_scheduling_tests")
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

    public async Task<MemberPackage> SeedMemberPackageAsync(
        Guid memberId,
        MemberPackageStatus status = MemberPackageStatus.Active,
        int? remainingSessions = 10,
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
            StartDate = today.AddDays(-1),
            EndDate = endDate ?? today.AddDays(29),
            RemainingSessions = remainingSessions,
            Status = status
        };

        db.MemberPackages.Add(memberPackage);
        await db.SaveChangesAsync();

        return memberPackage;
    }

    public async Task<MemberPackage> ReloadPackageAsync(Guid memberPackageId)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        return await db.MemberPackages.AsNoTracking().SingleAsync(p => p.MemberPackageId == memberPackageId);
    }

    public async Task<T> QueryAsync<T>(Func<SportHubDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        return await query(db);
    }
}

[CollectionDefinition(nameof(SchedulingApiCollection))]
public sealed class SchedulingApiCollection : ICollectionFixture<SchedulingApiFactory>;
