using AdministrationSystemSettingProvider = SportHub.Administration.Infrastructure.SystemSettingProvider;
using DotNetEnv;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.AI.Infrastructure;
using SportHub.AI.Infrastructure.Python;
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
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Infrastructure.Email;
using SportHub.Identity.Infrastructure.Repositories;
using SportHub.Identity.Infrastructure;
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
using SportHub.Payment.VnPay;
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

    // BR-78 — chặt hơn auth-register (3/phút theo IP) vì mỗi request gửi 1 email thật ra ngoài.
    options.AddPolicy("auth-register-otp", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    // BR-103 — quên/đặt lại mật khẩu: 3/phút theo IP (mỗi forgot gửi 1 email thật).
    options.AddPolicy("auth-password-reset", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    options.AddPolicy("point-confirmation", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: (httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown") + ":"
                + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
                    System.Text.Encoding.UTF8.GetBytes(httpContext.Request.Headers.Authorization.ToString()))),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    options.AddPolicy("checkout-write", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.User.Identity?.Name
                ?? httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    options.AddPolicy("avatar-write", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                ?? httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    options.AddPolicy("vnp-ipn", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
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
builder.Services.AddScoped<IAuditReader, AuditReader>();
builder.Services.AddScoped<INotificationWriter, NotificationWriter>();
builder.Services.AddScoped<INotificationDeliveryReader, NotificationDeliveryReader>();
builder.Services.AddScoped<SportHub.Notification.Application.Services.EmailDispatchService>();
builder.Services.AddScoped<SportHub.Notification.Application.Services.ManualNoticeService>();
builder.Services.AddScoped<ISystemSettingProvider, SystemSettingProvider>();

// Identity
builder.Services.AddScoped<IUserAccountRepository, UserAccountRepository>();
builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAccountService, AccountService>();
builder.Services.AddScoped<AvatarService>();
builder.Services.AddHttpClient<IAvatarStorage, CloudinaryAvatarStorage>(client =>
    client.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddScoped<IPasswordResetService, PasswordResetService>();
builder.Services.AddScoped<EmailOtpFlow>();
builder.Services.AddScoped<CoachSpecialtyService>();
builder.Services.AddScoped<CoachAdminService>();
builder.Services.AddScoped<IUserSummaryFactory, UserSummaryFactory>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Identity.IUserAccessReader, UserAccessReader>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Identity.ICoachSpecialtyReader, CoachSpecialtyReader>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Scheduling.ISportCatalogReader, SportHub.Scheduling.Catalog.Application.SportCatalogReader>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Scheduling.ISchedulingAvailabilityReader, SportHub.Scheduling.Occupancy.Application.SchedulingAvailabilityReader>();
builder.Services.AddScoped<IGoogleTokenVerifier, GoogleTokenVerifier>();
builder.Services.AddScoped<IGoogleAuthService, GoogleAuthService>();

// OTP: log email chỉ khi Development và Email:DemoLoggingEnabled được bật rõ ràng.
var smtpSection = builder.Configuration.GetSection("Smtp");
if (string.IsNullOrWhiteSpace(smtpSection["Host"]))
{
    var emailSmtpSection = builder.Configuration.GetSection("Email:Smtp");
    if (!string.IsNullOrWhiteSpace(emailSmtpSection["Host"]))
    {
        smtpSection = emailSmtpSection;
    }
}
builder.Services.Configure<EmailOptions>(smtpSection);
var dataProtection = builder.Services.AddDataProtection();
var dataProtectionKeysPath = builder.Configuration["DataProtection:KeysPath"];
if (!builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(dataProtectionKeysPath))
    throw new InvalidOperationException("DataProtection:KeysPath must point to durable storage outside Development.");
if (!string.IsNullOrWhiteSpace(dataProtectionKeysPath))
{
    Directory.CreateDirectory(dataProtectionKeysPath);
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));
}
var configuredSmtpHost = smtpSection["Host"];
var configuredSmtpFrom = smtpSection["FromAddress"];
if ((!builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(configuredSmtpHost))
    || (!string.IsNullOrWhiteSpace(configuredSmtpHost) && string.IsNullOrWhiteSpace(configuredSmtpFrom)))
    throw new InvalidOperationException("SMTP Host and FromAddress must be configured outside explicit Development logging mode.");
builder.Services.AddScoped<IEmailSender>(sp =>
    string.IsNullOrWhiteSpace(sp.GetRequiredService<IOptions<EmailOptions>>().Value.Host)
        ? builder.Environment.IsDevelopment() && builder.Configuration.GetValue<bool>("Email:DemoLoggingEnabled")
            ? new LoggingEmailSender(sp.GetRequiredService<ILogger<LoggingEmailSender>>())
            : new UnavailableEmailSender()
        : new SmtpEmailSender(sp.GetRequiredService<IOptions<EmailOptions>>()));

// Administration (BR-2, BR-6, BR-7, BR-39, BR-44..BR-48)
builder.Services.AddScoped<IUserAdminService, UserAdminService>();
builder.Services.AddScoped<StaffInvitationExpiryService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Identity.IStaffInvitationExpiryReader>(
    sp => sp.GetRequiredService<StaffInvitationExpiryService>());
builder.Services.AddScoped<SportHub.Administration.Application.Services.ActivationLinkService>();
builder.Services.AddScoped<SportHub.Administration.Application.Services.FrontDeskMemberService>();
builder.Services.AddScoped<ISystemSettingService, SystemSettingService>();
builder.Services.AddScoped<IAuditQueryService, AuditQueryService>();
builder.Services.AddSingleton<IReportStorage, FileSystemReportStorage>();
builder.Services.AddSingleton<IReportPdfRenderer, ReportPdfRenderer>();
builder.Services.AddScoped<IReportExportService, ReportExportService>();

// Membership
builder.Services.AddScoped<IMembershipPackageService, MembershipPackageService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Membership.IMembershipFulfillment, MembershipFulfillment>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Membership.IMembershipAccessReader, MembershipAccessReader>();
builder.Services.AddScoped<IMemberPackageService, MemberPackageService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Membership.IMembershipClosureExtension, MembershipClosureExtension>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Scheduling.IGymClosureReader, SportHub.Scheduling.Rental.Application.GymClosureReader>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Membership.IMembershipRefundFulfillment, MembershipRefundFulfillment>();
builder.Services.AddScoped<IMemberTrainingProfileService, MemberTrainingProfileService>();
builder.Services.AddScoped<IMembershipReportService, MembershipReportService>();
builder.Services.AddScoped<IMembershipPurchaseReportReader, MembershipPurchaseReportReader>();

// Notification
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<INotificationActionReader, SportHub.API.Persistence.NotificationActionReader>();

// Scheduling
builder.Services.AddScoped<IGymCheckInRepository, GymCheckInRepository>();
builder.Services.AddScoped<IGymCheckInService, GymCheckInService>();
builder.Services.AddSingleton<SportHub.Scheduling.Application.Services.MemberCheckInCodeService>();
builder.Services.AddScoped<IRoomService, RoomService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Scheduling.IOccupancyService, SportHub.Scheduling.Occupancy.Application.OccupancyService>();
builder.Services.AddScoped<SportHub.Scheduling.Occupancy.Application.AvailabilityService>();
builder.Services.AddScoped<SportHub.Scheduling.Catalog.Application.SportCatalogService>();
builder.Services.AddScoped<SportHub.Scheduling.Catalog.Application.RoomTypeService>();
builder.Services.AddScoped<SportHub.Scheduling.Catalog.Application.RoomOpeningHourService>();
builder.Services.AddScoped<SportHub.Scheduling.Catalog.Application.RoomBlockService>();
builder.Services.AddScoped<SportHub.Scheduling.Catalog.Application.CourtRateService>();
builder.Services.AddScoped<SportHub.Scheduling.Rental.Application.CourtRentalService>();
builder.Services.AddScoped<SportHub.Scheduling.Rental.Application.CourtRentalOperationsService>();
builder.Services.AddScoped<SportHub.Scheduling.Rental.Application.IncidentService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Scheduling.ICourtRentalFulfillment>(
    sp => sp.GetRequiredService<SportHub.Scheduling.Rental.Application.CourtRentalService>());
builder.Services.AddScoped<IClassService, ClassService>();
builder.Services.AddScoped<ClassTeachingService>();
builder.Services.AddScoped<ClassSessionChangeRequestService>();
builder.Services.AddScoped<CourseCancellationService>();
builder.Services.AddScoped<SportHub.Scheduling.Threshold.Application.IClassThresholdService,
    SportHub.Scheduling.Threshold.Application.ClassThresholdService>();
builder.Services.AddScoped<SportHub.Scheduling.Threshold.Application.ThresholdResponseService>();
builder.Services.AddScoped<SportHub.Scheduling.Threshold.Application.ThresholdResponseExpiryService>();
builder.Services.AddScoped<IClassSessionService, ClassSessionService>();
builder.Services.AddScoped<IClassEnrollmentReportService, ClassEnrollmentReportService>();
builder.Services.AddScoped<SportHub.Scheduling.Rental.Application.CourtScheduleService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Reporting.IClassEnrollmentExportReader, ClassEnrollmentExportReader>();
builder.Services.AddScoped<CourseValidator>();
builder.Services.AddScoped<SeatHoldService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Scheduling.IClassEnrollmentFulfillment, ClassEnrollmentFulfillment>();
builder.Services.AddScoped<IEnrollmentService, EnrollmentService>();
builder.Services.AddScoped<IAttendanceService, AttendanceService>();

// Payment
builder.Services.AddScoped<IInvoiceNumberGenerator, InvoiceNumberGenerator>();
builder.Services.AddScoped<IInvoiceQueryService, InvoiceQueryService>();
builder.Services.AddScoped<IPackagePurchaseService, PackagePurchaseService>();
builder.Services.AddScoped<IPaymentRecordingService, PaymentRecordingService>();
builder.Services.AddScoped<IPackageActivationService, PackageActivationService>();
builder.Services.AddScoped<IPaymentAdjustmentService, PaymentAdjustmentService>();
builder.Services.AddScoped<IPointRefundService, PointRefundService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Payment.IRefundCreditService, RefundCreditService>();
builder.Services.AddScoped<IRevenueReportService, RevenueReportService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Reporting.IRevenueDimensionReader, RevenueDimensionReader>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Wallet.IPointWalletService, SportHub.Payment.Wallet.Application.PointWalletService>();
builder.Services.AddScoped<SportHub.Payment.Wallet.Application.WalletQueryService>();
builder.Services.AddScoped<SportHub.Payment.Wallet.Application.PointAdjustmentService>();
builder.Services.AddScoped<SportHub.Payment.Wallet.Application.PointConfirmationService>();
var vnPaySection = builder.Configuration.GetSection(VnPayOptions.SectionName);
var vnPayUseMock = vnPaySection.GetValue<bool>(nameof(VnPayOptions.UseMock));
if (vnPayUseMock && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("VnPay:UseMock is supported only in explicit Development.");
if (!builder.Environment.IsDevelopment())
{
    var paymentUrl = vnPaySection[nameof(VnPayOptions.PaymentUrl)] ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
    var queryUrl = vnPaySection[nameof(VnPayOptions.QueryUrl)] ?? "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
    if (string.IsNullOrWhiteSpace(vnPaySection[nameof(VnPayOptions.TmnCode)])
        || string.IsNullOrWhiteSpace(vnPaySection[nameof(VnPayOptions.HashSecret)])
        || !Uri.TryCreate(vnPaySection[nameof(VnPayOptions.ReturnUrl)], UriKind.Absolute, out var returnUri)
        || returnUri.Scheme != Uri.UriSchemeHttps
        || !Uri.TryCreate(paymentUrl, UriKind.Absolute, out var paymentUri) || paymentUri.Scheme != Uri.UriSchemeHttps
        || !Uri.TryCreate(queryUrl, UriKind.Absolute, out var queryUri) || queryUri.Scheme != Uri.UriSchemeHttps)
        throw new InvalidOperationException("VnPay credentials and HTTPS PaymentUrl/ReturnUrl/QueryUrl must be configured outside Development.");
}
builder.Services.Configure<VnPayOptions>(vnPaySection);
builder.Services.AddHttpClient<VnPayGateway>();
builder.Services.AddSingleton<IPaymentGateway>(sp =>
    sp.GetRequiredService<IHostEnvironment>().IsDevelopment()
    && sp.GetRequiredService<IOptions<VnPayOptions>>().Value.UseMock
        ? new MockPaymentGateway()
        : sp.GetRequiredService<VnPayGateway>());
builder.Services.AddScoped<CheckoutService>();
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Payment.ICheckoutLifecycleService>(
    sp => sp.GetRequiredService<CheckoutService>());
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Payment.IInvoiceDraftWriter, InvoiceDraftWriter>();
builder.Services.AddScoped<PaymentFulfillmentService>();
builder.Services.AddScoped<PaymentReconciliationService>();
builder.Services.AddScoped<CheckoutExpiryService>();

// Training — một instance phục vụ cả interface nghiệp vụ lẫn seam ICoachRelationshipRegistrar
// mà Scheduling dùng, để quan hệ ClassBased nằm cùng change tracker với đăng ký sinh ra nó.
builder.Services.AddScoped<CoachMemberRelationshipService>();
builder.Services.AddScoped<ICoachMemberRelationshipService>(
    sp => sp.GetRequiredService<CoachMemberRelationshipService>());
builder.Services.AddScoped<ICoachRelationshipRegistrar>(
    sp => sp.GetRequiredService<CoachMemberRelationshipService>());
builder.Services.AddScoped<SportHub.BuildingBlocks.Abstractions.Training.ICoachMemberAccessReader>(
    sp => sp.GetRequiredService<CoachMemberRelationshipService>());


// AI — bản cài đặt theo luật, chạy cục bộ (xem RuleBasedAiRecommendationService).
builder.Services.AddScoped<IAiRecommendationService, RuleBasedAiRecommendationService>();
builder.Services.AddScoped<IWorkoutRecommendationService, WorkoutRecommendationService>();
// AI Flow 6 — Gemini assistant

builder.Services.AddScoped<
    IAiContextBuilder,
    SportHubAiContextBuilder>();

builder.Services.AddScoped<
    IAiChatService,
    AiChatService>();

builder.Services.AddScoped<
    IPythonAiClient,
    PythonAiClient>();

builder.Services.AddScoped<
    IManagerScheduleContextBuilder,
    ManagerScheduleContextBuilder>();

builder.Services.AddScoped<
    IAiChatProvider,
    PythonAiChatProvider>();

builder.Services.AddScoped<
    IManagerScheduleSuggestionService,
    ManagerScheduleSuggestionService>();

builder.Services.AddHttpClient(
    "SportHubPythonAI",
    client =>
    {
        var baseUrl =
            builder.Configuration[
                "AiService:BaseUrl"]
            ?? "http://localhost:8001";

        client.BaseAddress =
            new Uri(baseUrl);

        client.Timeout =
            TimeSpan.FromSeconds(35);
    });

// Tác vụ nền: BR-11/BR-33 (hạn gói), BR-20/BR-53 (No-show), BR-34 (phát thông báo).
builder.Services.AddHostedService<MemberPackageExpiryJob>();
builder.Services.AddHostedService<StaffInvitationExpiryJob>();
builder.Services.AddHostedService<ClassStatusJob>();
builder.Services.AddHostedService<ClassThresholdEvaluationJob>();
builder.Services.AddHostedService<ClassThresholdResponseExpiryJob>();
builder.Services.AddHostedService<RentalStatusJob>();
builder.Services.AddHostedService<SeatHoldExpiryJob>();
builder.Services.AddHostedService<CheckoutExpiryJob>();
builder.Services.AddHostedService<PaymentReconciliationJob>();
builder.Services.AddHostedService<PointHoldExpiryJob>();
builder.Services.AddHostedService<NotificationDispatchJob>();
builder.Services.AddHostedService<AvatarDeletionJob>();

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

        options.JsonSerializerOptions.Converters.Add(
            new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper, allowIntegerValues: false));
    });
builder.Services.AddSportHubSwagger();

builder.Services.AddScoped<DemoDataSeeder>();
builder.Services.AddScoped<Br141DemoSeeder>();
builder.Services.AddScoped<DemoFlow12Seeder>();
builder.Services.AddScoped<CoachRosterSeeder>();
builder.Services.AddScoped<FacilityBaselineSeeder>();
builder.Services.AddScoped<PaymentNoticeService>();

var app = builder.Build();

if (args.Any(a => a == "--seed-coach-teaching=true"))
{
    if (!app.Environment.IsDevelopment())
        throw new InvalidOperationException("Coach teaching fixtures are only available in Development.");
    var target = new Npgsql.NpgsqlConnectionStringBuilder(app.Configuration.GetConnectionString("Default"));
    if (target.Host is not ("localhost" or "127.0.0.1" or "::1"))
        throw new InvalidOperationException("Coach teaching fixtures must target a local Development database.");
    Console.WriteLine($"[seed-coach-teaching] database '{target.Database}' on '{target.Host}:{target.Port}'");
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<SportHubDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<DemoDataSeeder>().SeedCoachTeachingAsync();
    return;
}

if (args.Any(a => a == "--seed-member-calendar=true"))
{
    if (!app.Environment.IsDevelopment())
        throw new InvalidOperationException("Member calendar fixtures are only available in Development.");
    var calendarDatabase = new Npgsql.NpgsqlConnectionStringBuilder(app.Configuration.GetConnectionString("Default"));
    if (calendarDatabase.Host is not ("localhost" or "127.0.0.1" or "::1"))
        throw new InvalidOperationException("Calendar fixtures must target a local Development database.");
    await using var calendarScope = app.Services.CreateAsyncScope();
    await calendarScope.ServiceProvider.GetRequiredService<DemoDataSeeder>().SeedMemberCalendarAsync();
    return;
}

// Đội huấn luyện viên demo (5 PT, 2 cầu lông, 2 bóng rổ; tên người Việt, ảnh minh họa), idempotent, không xóa dữ liệu:
//   dotnet run --project backend/SportHub.API -- --seed-coaches=true
if (args.Any(a => a == "--seed-coaches=true"))
{
    if (!app.Environment.IsDevelopment())
        throw new InvalidOperationException("Demo fixtures are only available in Development.");
    await using var coachScope = app.Services.CreateAsyncScope();
    await coachScope.ServiceProvider.GetRequiredService<SportHubDbContext>().Database.MigrateAsync();
    await coachScope.ServiceProvider.GetRequiredService<CoachRosterSeeder>().SeedAsync();
    return;
}

// Seed demo BR-141 (lớp cố định + giá thuê sân): lệnh riêng, chạy tay khi sẵn sàng, không chạy lúc khởi động bình thường.
//   dotnet run --project backend/SportHub.API -- --seed-br141=true
// Viết `--seed-br141=true` (có giá trị): provider dòng lệnh của .NET coi tham số `--khoá` đứng một mình là "khóa + giá trị là
// tham số kế tiếp", nên `--seed-br141 --ConnectionStrings:Default=...` nuốt mất chuỗi kết nối và seed chạy vào DB mặc định.
if (args.Any(a => a.StartsWith("--seed-br141", StringComparison.Ordinal)))
{
    var target = new Npgsql.NpgsqlConnectionStringBuilder(app.Configuration.GetConnectionString("Default"));
    Console.WriteLine($"[seed-br141] database '{target.Database}' on '{target.Host}:{target.Port}'");
    await using var seedScope = app.Services.CreateAsyncScope();
    await seedScope.ServiceProvider.GetRequiredService<SportHubDbContext>().Database.MigrateAsync();
    await seedScope.ServiceProvider.GetRequiredService<FacilityBaselineSeeder>().SeedAsync();
    await seedScope.ServiceProvider.GetRequiredService<Br141DemoSeeder>().SeedAsync();
    return;
}

// Seed demo Flow 1 + Flow 2 (Member demo có ví điểm, gói Gym, lớp 2 chỗ): lệnh riêng, idempotent.
//   dotnet run --project backend/SportHub.API -- --seed-demo-flow12=true
if (args.Any(a => a.StartsWith("--seed-demo-flow12", StringComparison.Ordinal)))
{
    var flow12Target = new Npgsql.NpgsqlConnectionStringBuilder(app.Configuration.GetConnectionString("Default"));
    Console.WriteLine($"[seed-demo-flow12] database '{flow12Target.Database}' on '{flow12Target.Host}:{flow12Target.Port}'");
    await using var flow12Scope = app.Services.CreateAsyncScope();
    await flow12Scope.ServiceProvider.GetRequiredService<SportHubDbContext>().Database.MigrateAsync();
    await flow12Scope.ServiceProvider.GetRequiredService<FacilityBaselineSeeder>().SeedAsync();
    await flow12Scope.ServiceProvider.GetRequiredService<DemoFlow12Seeder>().SeedAsync();
    return;
}

// Ở Development: áp migration rồi seed dữ liệu demo. Seeder tự bỏ qua nếu DB đã có tài khoản,
// nên không bao giờ ghi đè dữ liệu người dùng đang có. Roster Coach là cấu hình riêng, cần đồng bộ
// kể cả khi database đã có các loại tài khoản khác.
// Ở môi trường khác, migration chạy qua `dotnet ef database update` trong quy trình triển khai —
// tự migrate khi khởi động nhiều instance sẽ có nhiều tiến trình cùng đổi schema một lúc.
if (app.Environment.IsDevelopment())
{
    await using var startupScope = app.Services.CreateAsyncScope();

    await startupScope.ServiceProvider.GetRequiredService<SportHubDbContext>().Database.MigrateAsync();
    await startupScope.ServiceProvider.GetRequiredService<DemoDataSeeder>().SeedAsync();
    await startupScope.ServiceProvider.GetRequiredService<CoachRosterSeeder>().SeedAsync();
    await startupScope.ServiceProvider.GetRequiredService<FacilityBaselineSeeder>().SeedAsync();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseSportHubSwagger();

app.UseHttpsRedirection();
// UseRouting tường minh trước UseRateLimiter: limiter phải biết endpoint đã chọn thì mới
// áp đúng [EnableRateLimiting] của action.
app.UseRouting();
app.UseCors(CorsExtensions.PolicyName);
app.UseAuthentication();
app.UseRateLimiter();
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
