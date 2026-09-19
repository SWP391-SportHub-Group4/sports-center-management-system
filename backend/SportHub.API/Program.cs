using Microsoft.AspNetCore.Identity;
using DotNetEnv;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Extensions;
using SportHub.API.Middleware;
using SportHub.API.Modules.Identity.Admin;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Domain.Entities;

LoadRootEnvIfPresent();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<SportHubDbContext>(options =>
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
        .UseSnakeCaseNamingConvention());
builder.Services.AddScoped<ISportHubDbContext>(sp => sp.GetRequiredService<SportHubDbContext>());

builder.Services.AddSportHubCors(builder.Configuration);

builder.Services.AddSportHubJwtBearer(builder.Configuration);
builder.Services.AddSportHubAuthorizationPolicies();

builder.Services.AddScoped<IPasswordHasher<UserAccount>, PasswordHasher<UserAccount>>();
builder.Services.AddScoped<AdminUserService>();

builder.Services.AddControllers();
builder.Services.AddSportHubSwagger();

var app = builder.Build();

app.UseSportHubSwagger();

app.UseHttpsRedirection();
app.UseCors(CorsExtensions.PolicyName);
app.UseAuthentication();
app.UseMiddleware<CurrentAccountGuardMiddleware>();
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
