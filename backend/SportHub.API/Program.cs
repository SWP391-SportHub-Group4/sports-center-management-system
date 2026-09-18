using System.Text.Json;
using System.Threading.RateLimiting;
using DotNetEnv;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Extensions;
using SportHub.API.Middleware;
using SportHub.API.Persistence;
using SportHub.API.RateLimiting;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Infrastructure.Repositories;
using SportHub.Identity.Infrastructure.Security;
using SportHub.Identity.Application.Auth;
using SportHub.Identity.Infrastructure.Authentication;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

LoadRootEnvIfPresent();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<SportHubDbContext>(options =>
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
        .UseSnakeCaseNamingConvention());
builder.Services.AddScoped<ISportHubDbContext>(sp => sp.GetRequiredService<SportHubDbContext>());

builder.Services.AddSportHubCors(builder.Configuration);

builder.Services.AddSportHubJwtBearer(builder.Configuration);
// BR-6: chặn token của tài khoản bị khoá/xoá ngay tại bước xác thực request.
// Phải gọi SAU AddSportHubJwtBearer — PostConfigure bổ sung OnTokenValidated vào Events đã có.
builder.Services.AddAccountStatusJwtValidation();
builder.Services.AddSportHubAuthorizationPolicies();
builder.Services.Configure<GoogleAuthOptions>(builder.Configuration.GetSection("GoogleAuth"));
builder.Services.AddSingleton<IConfigurationManager<OpenIdConnectConfiguration>>(
    new ConfigurationManager<OpenIdConnectConfiguration>(
        "https://accounts.google.com/.well-known/openid-configuration",
        new OpenIdConnectConfigurationRetriever()));
builder.Services.AddSingleton<IGoogleTokenVerifier, GoogleTokenVerifier>();
builder.Services.AddScoped<GoogleAuthService>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("auth-register", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    // Login dùng policy riêng (10/phút theo IP) — quota và response 429 độc lập với register.
    options.AddPolicy<string, LoginRateLimitPolicy>(LoginRateLimitPolicy.PolicyName);
});

builder.Services.AddScoped<IUserAccountRepository, UserAccountRepository>();
builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IAuthService, AuthService>();

builder.Services.AddControllers()
    .AddApplicationPart(typeof(IdentityModuleMarker).Assembly)
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });
builder.Services.AddSportHubSwagger();

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseSportHubSwagger();

app.UseHttpsRedirection();
// UseRouting tường minh trước UseRateLimiter: limiter phải biết endpoint đã chọn thì mới
// áp đúng [EnableRateLimiting] của action.
app.UseRouting();
app.UseCors(CorsExtensions.PolicyName);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

static void LoadRootEnvIfPresent()
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    for (var i = 0; i < 6 && dir is not null; i++, dir = dir.Parent)
    {
        var envPath = Path.Combine(dir.FullName, ".env");
        if (File.Exists(envPath))
        {
            Env.Load(envPath);
            return;
        }
    }
}

// Lộ entry point cho WebApplicationFactory<Program> trong SportHub.Security.Tests.
// Top-level statements sinh ra class Program internal; test host cần nó public.
public partial class Program;
