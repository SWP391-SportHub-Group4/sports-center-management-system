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
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using Testcontainers.PostgreSql;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// Hạ tầng test module Payment — theo mẫu SportHub.Scheduling.Tests: PostgreSQL thật qua
/// Testcontainers, schema sinh bằng chính migration của project.
///
/// Bắt buộc PostgreSQL thật, không EF InMemory: những thứ đang kiểm chứng ở đây (CHECK
/// constraint bằng chứng hoàn tiền, SELECT ... FOR UPDATE khi hai request hoàn cùng lúc,
/// transaction rollback) chỉ tồn tại ở tầng DB. InMemory sẽ cho tất cả pass mà không chứng
/// minh được gì.
/// </summary>
public sealed class PaymentApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestSecretKey = "sporthub-payment-tests-secret-key-64-bytes-long-enough!!!!!!";

    /// <summary>
    /// Đường thoát khi máy không chạy được Docker: trỏ thẳng vào một PostgreSQL có sẵn.
    ///
    /// Bắt buộc là DB test RIÊNG (xem RUNBOOK) — suite này chạy migration và ghi dữ liệu thật,
    /// nên trỏ vào DB đang dùng là mất dữ liệu. Không có biến này thì dùng Testcontainers như
    /// các suite khác.
    /// </summary>
    private const string ExternalDbEnvVar = "SPORTHUB_TEST_POSTGRES";

    private static string? ExternalConnectionString
        => Environment.GetEnvironmentVariable(ExternalDbEnvVar) is { Length: > 0 } value ? value : null;

    private readonly PostgreSqlContainer? _postgres = ExternalConnectionString is null
        ? new PostgreSqlBuilder("postgres:16-alpine")
            .WithDatabase("sporthub_payment_tests")
            .WithUsername("sporthub")
            .WithPassword("sporthub-test-password")
            .Build()
        : null;

    public string ConnectionString => ExternalConnectionString ?? _postgres!.GetConnectionString();

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
        if (_postgres is not null)
        {
            await _postgres.StartAsync();
        }

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await db.Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        if (_postgres is not null)
        {
            await _postgres.DisposeAsync();
        }
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = ConnectionString,
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

    /// <summary>
    /// Một hoá đơn độc lập cho mỗi test. Mỗi test tự chuẩn bị dữ liệu riêng và không dùng
    /// chung bản ghi với test khác, nên chạy lặp hoặc chạy song song đều an toàn.
    /// </summary>
    public async Task<Invoice> SeedInvoiceAsync(
        Guid memberId,
        Guid issuedByUserId,
        decimal totalAmount,
        Guid? memberPackageId = null,
        DateTime? issuedAt = null,
        DateTime? dueDateUtc = null)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var issued = issuedAt ?? DateTime.UtcNow;

        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(),
            InvoiceNumber = $"INV-{Guid.NewGuid():N}"[..20],
            MemberId = memberId,
            IssuedByUserId = issuedByUserId,
            MemberPackageId = memberPackageId,
            TotalAmount = totalAmount,
            Status = InvoiceStatus.Issued,
            IssuedAt = issued,
            DueDateUtc = dueDateUtc ?? issued.AddMonths(2)
        };

        invoice.Items.Add(new InvoiceItem
        {
            ItemId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            Description = "Gói tập",
            Amount = totalAmount,
            RelatedEntityType = InvoiceItemRelatedEntityType.Package
        });

        db.Set<Invoice>().Add(invoice);
        await db.SaveChangesAsync();

        return invoice;
    }

    public async Task<(MembershipPackage Catalog, MemberPackage MemberPackage)> SeedPendingPackageAsync(
        Guid memberId, decimal price = 3_000_000m, int durationDays = 90, int? sessionLimit = 30)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var catalog = new MembershipPackage
        {
            Name = $"Package {Guid.NewGuid():N}",
            Price = price,
            DurationDays = durationDays,
            SessionLimit = sessionLimit
        };

        db.MembershipPackages.Add(catalog);
        await db.SaveChangesAsync();

        var memberPackage = new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = memberId,
            PackageId = catalog.PackageId,
            Status = Membership.Domain.Enums.MemberPackageStatus.PendingPayment
        };

        db.MemberPackages.Add(memberPackage);
        await db.SaveChangesAsync();

        return (catalog, memberPackage);
    }

    public async Task<T> QueryAsync<T>(Func<SportHubDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        return await query(db);
    }
}

[CollectionDefinition(nameof(PaymentApiCollection))]
public sealed class PaymentApiCollection : ICollectionFixture<PaymentApiFactory>;
