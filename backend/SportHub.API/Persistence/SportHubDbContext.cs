using Microsoft.EntityFrameworkCore;
using SportHub.Administration;
using SportHub.Administration.Domain.Entities;
using SportHub.AI;
using SportHub.AI.Domain.Entities;
using SportHub.Audit;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Scheduling;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Training;
using SportHub.Training.Domain.Entities;

namespace SportHub.API.Persistence;

public class SportHubDbContext : DbContext, ISportHubDbContext
{
    public SportHubDbContext(DbContextOptions<SportHubDbContext> options) : base(options)
    {
    }

    // 1) Identity/RBAC
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();
    public DbSet<UserCredential> UserCredentials => Set<UserCredential>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<UserExternalLogin> UserExternalLogins => Set<UserExternalLogin>();

    // 2) Membership
    public DbSet<MembershipPackage> MembershipPackages => Set<MembershipPackage>();
    public DbSet<MemberPackage> MemberPackages => Set<MemberPackage>();
    public DbSet<MemberTrainingProfile> MemberTrainingProfiles => Set<MemberTrainingProfile>();

    // 3) Training — hồ sơ & quan hệ (nền tảng cho AI/Workout)
    public DbSet<CoachMemberRelationship> CoachMemberRelationships => Set<CoachMemberRelationship>();

    // 4) Scheduling
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Class> Classes => Set<Class>();
    public DbSet<ClassRecurrence> ClassRecurrences => Set<ClassRecurrence>();
    public DbSet<ClassSession> ClassSessions => Set<ClassSession>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<GymCheckIn> GymCheckIns => Set<GymCheckIn>();

    // 5) Training — Workout
    public DbSet<WorkoutPlan> WorkoutPlans => Set<WorkoutPlan>();
    public DbSet<WorkoutPlanItem> WorkoutPlanItems => Set<WorkoutPlanItem>();
    public DbSet<WorkoutResult> WorkoutResults => Set<WorkoutResult>();

    // 6) Payment
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<SportHub.Payment.Domain.Entities.Payment> Payments => Set<SportHub.Payment.Domain.Entities.Payment>();
    public DbSet<PaymentAdjustment> PaymentAdjustments => Set<PaymentAdjustment>();

    // 7) AI
    public DbSet<AiLog> AiLogs => Set<AiLog>();

    // 8) Notification
    public DbSet<SportHub.Notification.Domain.Entities.Notification> Notifications => Set<SportHub.Notification.Domain.Entities.Notification>();

    // 9) Audit
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    // 10) Administration — cấu hình hệ thống (BR-39/BR-50) và tệp xuất báo cáo (BR-44..BR-48).
    // Hai entity này CHƯA có trong SSOT §2 — xem docs/implementation-decisions.md A1, A4.
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<ReportExport> ReportExports => Set<ReportExport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // citext cho UserAccount.email — email không phân biệt hoa/thường (BR-1/BR-49,
        // ràng buộc #9 ở Design v2 §3). Alternative nêu trong doc là index LOWER(email);
        // chọn citext vì đơn giản hơn khi khai báo qua Fluent API và Postgres hỗ trợ sẵn.
        modelBuilder.HasPostgresExtension("citext");

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(IdentityModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(MembershipModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SchedulingModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TrainingModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(Payment.PaymentModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AiModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(Notification.NotificationModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AuditModuleMarker).Assembly);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AdministrationModuleMarker).Assembly);

        // BR-58 — InvoiceNumber sinh từ DB sequence, không bao giờ gán ngẫu nhiên ở tầng ứng
        // dụng. Khai báo ở đây (thay vì trong IEntityTypeConfiguration) vì sequence là đối
        // tượng cấp database, không gắn với một entity type nào.
        // Đọc qua nextval() trong Payment/Infrastructure/InvoiceNumberGenerator.cs.
        modelBuilder.HasSequence<long>(Payment.Infrastructure.InvoiceNumberGenerator.SequenceName)
            .StartsAt(1)
            .IncrementsBy(1);

        // TODO (chưa làm — SSOT §7 Open Questions, "không tự quyết"):
        // - Cơ chế serialize/lưu enum dạng string UPPER_SNAKE_CASE (JsonStringEnumConverter
        //   + naming policy, hay map thủ công ở DTO layer) — hiện enum vẫn lưu int (mặc định
        //   EF Core). Khi chốt, áp HasConversion<string>() (hoặc converter tương đương) cho
        //   TỪNG property enum trong IEntityTypeConfiguration<T> tương ứng.
        // - Soft delete (is_deleted/deleted_at) — danh sách entity nào áp dụng chưa chốt (SSOT §5.5).
        // - Sinh Guid ở tầng nào (DB default gen_random_uuid() hay app layer) — SSOT §5.1.
    }
}
