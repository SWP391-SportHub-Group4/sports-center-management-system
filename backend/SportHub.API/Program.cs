using Microsoft.EntityFrameworkCore;
using SportHub.API.Extensions;
using SportHub.Repository;

var builder = WebApplication.CreateBuilder(args);

// ---- DB (Postgres) ----
builder.Services.AddDbContext<SportHubDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// ---- CORS (FE Next.js port 3000) ----
builder.Services.AddSportHubCors(builder.Configuration);

// ---- Auth (JWT/OAuth2 + RBAC) ----
// TODO (bước 1 - Identity/RBAC, xem docs/Center-Management-System-Design-v2.md mục 7):
// builder.Services.AddSportHubJwtAuthentication(builder.Configuration);
// builder.Services.AddAuthorization(options => { /* policies theo bảng RBAC mục 5 */ });

// ---- App services theo module ----
builder.Services.AddControllers();
builder.Services.AddSportHubSwagger();

var app = builder.Build();

app.UseSportHubSwagger();

app.UseHttpsRedirection();
app.UseCors(CorsExtensions.PolicyName); // phải đứng trước UseAuthentication/UseAuthorization/MapControllers
// app.UseAuthentication();
// app.UseAuthorization();
app.MapControllers();

app.Run();
