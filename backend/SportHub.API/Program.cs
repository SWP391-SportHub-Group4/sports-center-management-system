using AdministrationSystemSettingProvider = SportHub.Administration.Infrastructure.SystemSettingProvider;
using DotNetEnv;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.AI.Infrastructure;
using SportHub.AI;
using SportHub.API.Extensions;
using SportHub.API.Jobs;
using SportHub.API.Middleware;
using SportHub.API.Persistence;
using SportHub.API.RateLimiting;
using SportHub.Administration.Application.Interfaces;
using SportHub.Administration.Application.Services;
using SportHub.Administration.Infrastructure;
using SportHub.Administration;
using SportHub.Audit.Infrastructure;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Infrastructure.Repositories;
using SportHub.Identity.Infrastructure.Security;
using SportHub.Identity;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Application.Services;
using SportHub.Membership;
using SportHub.Notification.Application.Interfaces;
using SportHub.Notification.Application.Services;
using SportHub.Notification.Infrastructure;
using SportHub.Notification;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Infrastructure;
using SportHub.Payment;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Infrastructure.Repositories;
using SportHub.Scheduling;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;
using SportHub.Training;
using System.Text.Json.Serialization;
using System.Text.Json;
using System.Threading.RateLimiting;

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

// Hạ tầng dùng chung. IHttpContextAccessor cần cho AuditWriter (ghi IP của người thao tác, BR-7).
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IClock, SystemClock>();

// Các "seam" khai báo ở BuildingBlocks, cài đặt ở module tương ứng — xem ghi chú tại từng
// interface về lý do phải cắt vòng phụ thuộc theo cách này.
builder.Services.AddScoped<IAuditWriter, AuditWriter>();
builder.Services.AddScoped<INotificationWriter, NotificationWriter>();
builder.Services.AddScoped<ISystemSettingProvider, SystemSettingProvider>();

// Identity
builder.Services.AddScoped<IUserAccountRepository, UserAccountRepository>();
builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAccountService, AccountService>();
builder.Services.AddScoped<IGoogleTokenVerifier, GoogleTokenVerifier>();
builder.Services.AddScoped<IGoogleAuthService, GoogleAuthService>();

// Administration (BR-2, BR-6, BR-7, BR-39, BR-44..BR-48)
builder.Services.AddScoped<IUserAdminService, UserAdminService>();
builder.Services.AddScoped<ISystemSettingService, SystemSettingService>();
builder.Services.AddScoped<IAuditQueryService, AuditQueryService>();
builder.Services.AddSingleton<IReportStorage, FileSystemReportStorage>();
builder.Services.AddSingleton<IReportPdfRenderer, ReportPdfRenderer>();
builder.Services.AddScoped<IReportExportService, ReportExportService>();

// Membership
builder.Services.AddScoped<IMembershipPackageService, MembershipPackageService>();
builder.Services.AddScoped<IMemberPackageService, MemberPackageService>();
builder.Services.AddScoped<IMemberTrainingProfileService, MemberTrainingProfileService>();

// Notification
builder.Services.AddScoped<INotificationService, NotificationService>();

// Scheduling
builder.Services.AddScoped<IGymCheckInRepository, GymCheckInRepository>();
builder.Services.AddScoped<IGymCheckInService, GymCheckInService>();
builder.Services.AddScoped<IRoomService, RoomService>();
builder.Services.AddScoped<IClassService, ClassService>();
builder.Services.AddScoped<IClassSessionService, ClassSessionService>();
builder.Services.AddScoped<IEnrollmentService, EnrollmentService>();
builder.Services.AddScoped<IAttendanceService, AttendanceService>();

// Payment
builder.Services.AddScoped<IInvoiceNumberGenerator, InvoiceNumberGenerator>();
builder.Services.AddScoped<IInvoiceQueryService, InvoiceQueryService>();
builder.Services.AddScoped<IPackagePurchaseService, PackagePurchaseService>();
builder.Services.AddScoped<IPaymentRecordingService, PaymentRecordingService>();
builder.Services.AddScoped<IPackageActivationService, PackageActivationService>();
builder.Services.AddScoped<IPaymentAdjustmentService, PaymentAdjustmentService>();
builder.Services.AddScoped<IRevenueReportService, RevenueReportService>();

// Training — một instance phục vụ cả interface nghiệp vụ lẫn seam ICoachRelationshipRegistrar
// mà Scheduling dùng, để quan hệ ClassBased nằm cùng change tracker với đăng ký sinh ra nó.
builder.Services.AddScoped<CoachMemberRelationshipService>();
builder.Services.AddScoped<ICoachMemberRelationshipService>(
    sp => sp.GetRequiredService<CoachMemberRelationshipService>());
builder.Services.AddScoped<ICoachRelationshipRegistrar>(
    sp => sp.GetRequiredService<CoachMemberRelationshipService>());
builder.Services.AddScoped<IWorkoutService, WorkoutService>();

// AI — bản cài đặt theo luật, chạy cục bộ (xem RuleBasedAiRecommendationService).
builder.Services.AddScoped<IAiRecommendationService, RuleBasedAiRecommendationService>();
builder.Services.AddScoped<IWorkoutRecommendationService, WorkoutRecommendationService>();

// Tác vụ nền: BR-11/BR-33 (hạn gói), BR-20/BR-53 (No-show), BR-34 (phát thông báo).
builder.Services.AddHostedService<MemberPackageExpiryJob>();
builder.Services.AddHostedService<AttendanceFinalizerJob>();
builder.Services.AddHostedService<NotificationDispatchJob>();

builder.Services.AddControllers()
    .AddApplicationPart(typeof(IdentityModuleMarker).Assembly)
    .AddApplicationPart(typeof(SchedulingModuleMarker).Assembly)
    .AddApplicationPart(typeof(AdministrationModuleMarker).Assembly)
    .AddApplicationPart(typeof(MembershipModuleMarker).Assembly)
    .AddApplicationPart(typeof(PaymentModuleMarker).Assembly)
    .AddApplicationPart(typeof(TrainingModuleMarker).Assembly)
    .AddApplicationPart(typeof(NotificationModuleMarker).Assembly)
    .AddApplicationPart(typeof(AiModuleMarker).Assembly)
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;

        // Enum trả ra dạng CHUỖI PascalCase, khớp tên member enum ở SSOT §3 và khớp role
        // trong JWT. SSOT §3 mong muốn UPPER_SNAKE_CASE nhưng ghi rõ cơ chế "chưa chốt";
        // đổi bây giờ sẽ phá hợp đồng login đang được test kiểm chứng.
        // Xem docs/implementation-decisions.md B6.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddSportHubSwagger();

builder.Services.AddScoped<DemoDataSeeder>();

var app = builder.Build();

// Ở Development: áp migration rồi seed dữ liệu demo. Seeder tự bỏ qua nếu DB đã có tài khoản,
// nên không bao giờ ghi đè dữ liệu người dùng đang có.
// Ở môi trường khác, migration chạy qua `dotnet ef database update` trong quy trình triển khai —
// tự migrate khi khởi động nhiều instance sẽ có nhiều tiến trình cùng đổi schema một lúc.
if (app.Environment.IsDevelopment())
{
    await using var startupScope = app.Services.CreateAsyncScope();

    await startupScope.ServiceProvider.GetRequiredService<SportHubDbContext>().Database.MigrateAsync();
    await startupScope.ServiceProvider.GetRequiredService<DemoDataSeeder>().SeedAsync();
}

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
