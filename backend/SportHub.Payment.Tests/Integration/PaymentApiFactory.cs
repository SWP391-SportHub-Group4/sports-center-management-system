using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Net.Http.Headers;
using System.Text;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Infrastructure.Security;
using SportHub.Identity.Infrastructure.Email;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Notification.Infrastructure;
using Testcontainers.PostgreSql;

namespace SportHub.Payment.Tests.Integration;

public sealed class PaymentApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public CapturingPaymentEmailSender CapturedEmail { get; } = new();
    public const string TestSecretKey = "sporthub-payment-tests-secret-key-64-bytes-long-enough!!!!!!";

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
                ["Cors:AllowedOrigins:0"] = "http://localhost:3000",
                ["Logging:LogLevel:Default"] = "Warning",
                ["Logging:LogLevel:Microsoft.EntityFrameworkCore"] = "Error"
                , ["VnPay:UseMock"] = "true"
            }));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<INotificationWriter>();
            services.AddScoped<INotificationWriter>(sp => new CapturingPaymentOutboxWriter(
                sp.GetRequiredService<ISportHubDbContext>(),
                sp.GetRequiredService<IDataProtectionProvider>(),
                CapturedEmail));

            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender, UnavailableEmailSender>();
        });
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

    public async Task<Invoice> SeedInvoiceAsync(
        Guid memberId,
        Guid issuedByUserId,
        decimal totalAmount,
        Guid? memberPackageId = null,
        DateTime? issuedAt = null)
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
            IssuedAt = issued
        };

        invoice.Items.Add(new InvoiceItem
        {
            ItemId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            ItemType = InvoiceItemType.Membership,
            Description = "Gói tập",
            UnitPrice = totalAmount,
            Quantity = 1,
            LineAmount = totalAmount
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

public sealed class CapturingPaymentEmailSender : IEmailSender
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _codes = new();
    public Task SendAsync(string toAddress, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        Capture(toAddress, htmlBody);
        return Task.CompletedTask;
    }
    public void Capture(string toAddress, string htmlBody)
    {
        var match = System.Text.RegularExpressions.Regex.Match(htmlBody, "<strong>([0-9]{6})</strong>");
        if (match.Success) _codes[toAddress] = match.Groups[1].Value;
    }
    public string CodeFor(string address) => _codes[address];
}

public sealed class CapturingPaymentOutboxWriter(
    ISportHubDbContext db,
    IDataProtectionProvider protection,
    CapturingPaymentEmailSender emails) : INotificationWriter
{
    private readonly NotificationWriter _inner = new(db, protection);
    public void Queue(NotificationRequest request) => _inner.Queue(request);
    public void QueueEmail(EmailNotificationRequest request)
    {
        emails.Capture(request.RecipientAddress, request.HtmlBody);
        _inner.QueueEmail(request);
    }
}

[CollectionDefinition(nameof(PaymentApiCollection))]
public sealed class PaymentApiCollection : ICollectionFixture<PaymentApiFactory>;
