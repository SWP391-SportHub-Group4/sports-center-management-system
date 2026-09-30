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
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;
using Testcontainers.PostgreSql;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// Ha tang test cua module Training (BE-4: PT entitlement/session/homework) — cung mau voi
/// SchedulingApiFactory (PostgreSQL that qua Testcontainers, schema sinh bang chinh migration).
/// </summary>
public sealed class TrainingApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestSecretKey = "sporthub-training-tests-secret-key-64-bytes-long-enough!!!!";

    private readonly PostgreSqlContainer? _postgres = ExternalConnectionString is null ? new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("sporthub_training_tests")
        .WithUsername("sporthub")
        .WithPassword("sporthub-test-password")
        .Build() : null;

    private static string? ExternalConnectionString => Environment.GetEnvironmentVariable("SPORTHUB_TEST_POSTGRES");

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
        if (_postgres is not null) await _postgres.StartAsync();

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await db.Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        if (_postgres is not null) await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = ExternalConnectionString ?? _postgres!.GetConnectionString(),
                ["JwtOptions:Issuer"] = "SportHub.Api",
                ["JwtOptions:Audience"] = "SportHub.Client",
                ["JwtOptions:SecretKey"] = TestSecretKey,
                ["JwtOptions:AccessTokenExpiryMinutes"] = "60",
                ["Cors:AllowedOrigins:0"] = "http://localhost:3000"
            }));
    }

    /// <summary>Security stamp hiện tại của user trong DB test — token phải mang đúng stamp (claim sst).</summary>
    public Guid StampOf(Guid userId)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Persistence.ISportHubDbContext>();

        return db.Set<SportHub.Identity.Domain.Entities.UserAccount>()
            .AsNoTracking()
            .Where(u => u.UserId == userId)
            .Select(u => u.SecurityStamp)
            .SingleOrDefault();
    }

    public HttpClient CreateApiClient(Guid? actingUserId = null, UserRole? actingRole = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        if (actingUserId is not null && actingRole is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                JwtService.GenerateAccessToken(actingUserId.Value, actingRole.Value.ToString(), EffectiveJwtOptions, StampOf(actingUserId.Value)));
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

    /// <summary>
    /// Coach voi chuyen mon tuong ung (thay CoachCategory cu): PersonalTrainer = mon OneOnOne (sport 2), ClassInstructor = mon nhom
    /// (sport 3). Can cho moi test RBAC/authorization cua PT.
    /// </summary>
    public async Task<UserAccount> SeedCoachAsync(
        CoachKind kind,
        UserStatus status = UserStatus.Active)
    {
        var coach = await SeedUserAsync(UserRole.Coach, status);

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
        db.UserSportSpecialties.Add(new UserSportSpecialty
        {
            UserId = coach.UserId,
            SportId = kind == CoachKind.PersonalTrainer ? 2 : 3
        });
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

    /// <summary>PtEntitlement Active sẵn sàng để test booking/quota — validity mặc định rộng
    /// (hôm nay ± 60 ngày) để test tự chọn StartAtUtc mà không lo rơi ngoài hiệu lực.</summary>
    public async Task<PtEntitlement> SeedPtEntitlementAsync(
        Guid memberId,
        Guid coachId,
        int totalQuota = 8,
        int reservedSessions = 0,
        int consumedSessions = 0,
        DateOnly? validityStartDate = null,
        DateOnly? validityEndDate = null,
        PtEntitlementStatus status = PtEntitlementStatus.Active)
    {
        var memberPackage = await SeedMemberPackageAsync(
            memberId,
            startDate: validityStartDate ?? DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-60),
            endDate: validityEndDate ?? DateOnly.FromDateTime(DateTime.UtcNow).AddDays(60));

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var entitlement = new PtEntitlement
        {
            EntitlementId = Guid.NewGuid(),
            ActivationReference = Guid.NewGuid(),
            MemberId = memberId,
            CoachId = coachId,
            OriginMemberPackageId = memberPackage.MemberPackageId,
            CurrentMemberPackageId = memberPackage.MemberPackageId,
            FrequencyPerWeek = 2,
            TotalQuota = totalQuota,
            ReservedSessions = reservedSessions,
            ConsumedSessions = consumedSessions,
            ValidityStartDate = memberPackage.StartDate,
            ValidityEndDate = memberPackage.EndDate,
            CarryOverUntilDate = memberPackage.EndDate.AddDays(30),
            Status = status,
            ActivatedAt = status == PtEntitlementStatus.Active ? DateTime.UtcNow : null,
            Version = 0
        };

        db.PtEntitlements.Add(entitlement);
        await db.SaveChangesAsync();

        return entitlement;
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

/// <summary>Loai Coach dung trong test (thay enum CoachCategory da go): quyet dinh mon chuyen mon duoc seed.</summary>
public enum CoachKind
{
    PersonalTrainer,
    ClassInstructor
}
