using DotNetEnv;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Extensions;
using SportHub.Repository;

LoadRootEnvIfPresent();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<SportHubDbContext>(options =>
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
        .UseSnakeCaseNamingConvention());

builder.Services.AddSportHubCors(builder.Configuration);

builder.Services.AddSportHubJwtAuthentication(builder.Configuration);

builder.Services.AddControllers();
builder.Services.AddSportHubSwagger();

var app = builder.Build();

app.UseSportHubSwagger();

app.UseHttpsRedirection();
app.UseCors(CorsExtensions.PolicyName);
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
