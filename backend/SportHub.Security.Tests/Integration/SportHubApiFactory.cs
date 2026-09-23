using System.Collections.Concurrent;
using System.Text;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Infrastructure.Repositories;
using SportHub.Identity.Infrastructure.Security;
using Testcontainers.PostgreSql;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Host test that chay tren PostgreSQL rieng qua Testcontainers (KHONG dung DB dev).
/// Dung dung image postgres:16-alpine nhu docker-compose de citext va behavior khop production.
/// Schema tao bang chinh migration cua project — khong sua schema de phuc vu test.
/// </summary>
public sealed class SportHubApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string ClientIpHeader = "X-Test-Client-Ip";

    public const string TestSecretKey = "sporthub-integration-tests-secret-key-64-bytes-long-enough!!";

    public const string TestIssuer = "SportHub.Api";

    public const string TestAudience = "SportHub.Client";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("sporthub_tests")
        .WithUsername("sporthub")
        .WithPassword("sporthub-test-password")
        .Build();

    public CallSpy Spy { get; } = new();

    /// <summary>Toan bo log sinh ra trong host test — dung de chot khong log password/hash/JWT.</summary>
    public ConcurrentQueue<string> Logs { get; } = new();

    /// <summary>
    /// JwtOptions THUC SU dang duoc JwtBearer handler dung de validate token.
    /// Khong tu dung hang so cua test: AddSportHubJwtBearer doc configuration NGAY tai luc
    /// dang ky service (truoc khi ConfigureAppConfiguration cua host test kip ap dung), nen
    /// khoa ky that co the den tu appsettings chu khong phai override cua test. Doc nguoc
    /// lai tu TokenValidationParameters la cach duy nhat chac chan khop.
    /// </summary>
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

    // Explicit interface implementation: IAsyncLifetime cua xunit 2.x dung Task, con
    // WebApplicationFactory da co ValueTask DisposeAsync() — hai chu ky trung ten.
    async Task IAsyncLifetime.InitializeAsync()
    {
        await _postgres.StartAsync();

        // Tao schema bang chinh migration cua project (co citext + seed 5 role).
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

        // AddInMemoryCollection dat cuoi chuoi provider nen thang ca appsettings lan
        // bien moi truong tu .env cua may dev.
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = _postgres.GetConnectionString(),
                ["JwtOptions:Issuer"] = TestIssuer,
                ["JwtOptions:Audience"] = TestAudience,
                ["JwtOptions:SecretKey"] = TestSecretKey,
                ["JwtOptions:AccessTokenExpiryMinutes"] = "60",
                ["Cors:AllowedOrigins:0"] = "http://localhost:3000"
            }));

        builder.ConfigureTestServices(services =>
        {
            // Controller chi ton tai trong assembly test — khong them endpoint debug vao production.
            services.AddControllers().AddApplicationPart(typeof(SportHubApiFactory).Assembly);

            services.AddSingleton(Spy);

            // Boc spy quanh implementation that: van dung PostgreSQL that va BCrypt that.
            services.RemoveAll<IUserAccountRepository>();
            services.AddScoped<UserAccountRepository>();
            services.AddScoped<IUserAccountRepository>(sp => new SpyUserAccountRepository(
                sp.GetRequiredService<UserAccountRepository>(),
                sp.GetRequiredService<CallSpy>()));

            services.RemoveAll<IPasswordHasher>();
            services.AddScoped<PasswordHasher>();
            services.AddScoped<IPasswordHasher>(sp => new SpyPasswordHasher(
                sp.GetRequiredService<PasswordHasher>(),
                sp.GetRequiredService<CallSpy>()));

            // IStartupFilter chay TRUOC pipeline cua Program.cs, tuc truoc UseRouting/
            // UseRateLimiter — dung de gia lap IP client that thay vi X-Forwarded-For.
            services.AddSingleton<IStartupFilter, ClientIpStartupFilter>();

            services.AddLogging(logging =>
            {
                logging.SetMinimumLevel(LogLevel.Debug);
                logging.AddProvider(new CapturingLoggerProvider(Logs));
            });
        });
    }

    /// <summary>HttpClient khong tu redirect, de 307 cua UseHttpsRedirection lo ra neu co.</summary>
    public HttpClient CreateApiClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    public async Task<UserAccount> SeedUserAsync(
        string email,
        string? password,
        UserStatus status = UserStatus.Active,
        UserRole role = UserRole.Member,
        string fullName = "Nguyen Van A")
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var hasher = new PasswordHasher();

        var roleEntity = await db.Roles.SingleAsync(r => r.RoleName == role);

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = roleEntity.RoleId,
            Status = status,
            CreatedAt = DateTime.UtcNow,
            Profile = new UserProfile { FullName = fullName }
        };

        // password == null: khong tao row UserCredential nao ca (tai khoan Google-only / staff chua dat password).
        if (password is not null)
        {
            user.Credential = new UserCredential { PasswordHash = hasher.Hash(password) };
        }

        db.UserAccounts.Add(user);
        await db.SaveChangesAsync();

        user.Role = roleEntity;
        return user;
    }

    /// <summary>Tao row UserCredential voi hash NULL/rong — duong du lieu khac voi "khong co row".</summary>
    public async Task AddEmptyCredentialAsync(Guid userId, string? passwordHash)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        db.UserCredentials.Add(new UserCredential { UserId = userId, PasswordHash = passwordHash });
        await db.SaveChangesAsync();
    }

    public async Task SetStatusAsync(Guid userId, UserStatus status)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var user = await db.UserAccounts.SingleAsync(u => u.UserId == userId);
        user.Status = status;
        await db.SaveChangesAsync();
    }

    public string IssueToken(Guid userId, UserRole role)
        => JwtService.GenerateAccessToken(userId, role.ToString(), EffectiveJwtOptions);
}

/// <summary>Gom moi dong log cua host test vao mot hang doi de assert.</summary>
public sealed class CapturingLoggerProvider(ConcurrentQueue<string> sink) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, sink);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(string category, ConcurrentQueue<string> sink) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
            => sink.Enqueue($"{logLevel} {category} {formatter(state, exception)} {exception}");
    }
}

/// <summary>
/// Dat HttpContext.Connection.RemoteIpAddress tu header test, truoc khi routing va
/// rate limiter chay. Khong dung X-Forwarded-For vi production khong doc header do.
/// </summary>
public sealed class ClientIpStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (context, nextMiddleware) =>
        {
            if (context.Request.Headers.TryGetValue(SportHubApiFactory.ClientIpHeader, out var raw)
                && IPAddress.TryParse(raw.ToString(), out var ip))
            {
                context.Connection.RemoteIpAddress = ip;
            }

            await nextMiddleware();
        });

        next(app);
    };
}
