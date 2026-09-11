using Microsoft.EntityFrameworkCore;
using SportHub.API.Extensions;
using SportHub.Repository;

var builder = WebApplication.CreateBuilder(args);

// ---- DB (Postgres) ----
// Entity/property dùng PascalCase (chuẩn C#) — UseSnakeCaseNamingConvention() tự
// động map sang tên cột/bảng snake_case (chuẩn Postgres) khi sinh SQL/migration.
builder.Services.AddDbContext<SportHubDbContext>(options =>
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
        .UseSnakeCaseNamingConvention());

// ---- CORS (FE Next.js port 3000) ----
builder.Services.AddSportHubCors(builder.Configuration);

// ---- Auth (JWT + RBAC, xem docs mục 5) ----
builder.Services.AddSportHubJwtAuthentication(builder.Configuration);

// ---- App services theo module ----
builder.Services.AddControllers();
builder.Services.AddSportHubSwagger();

var app = builder.Build();

app.UseSportHubSwagger();

app.UseHttpsRedirection();
app.UseCors(CorsExtensions.PolicyName); // phải đứng trước UseAuthentication/UseAuthorization/MapControllers
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
