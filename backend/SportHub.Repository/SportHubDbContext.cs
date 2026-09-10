using Microsoft.EntityFrameworkCore;
using SportHub.Repository.Entities;

namespace SportHub.Repository;

// DbSet cho từng entity theo thứ tự code ở docs/Center-Management-System-Design-v2.md, mục 7:
// 1) Identity/RBAC  2) Membership  3) Training (hồ sơ/quan hệ)  4) Scheduling  5) Training (Workout)
// 6) Payment  7) AI  8) Shared (Notification/AuditLog — module chưa gán chính thức, SSOT §7 Open Questions)
//
// Naming: field/property = snake_case (SSOT §5.4). Enum vẫn lưu dạng mặc định của
// EF Core (int) — cơ chế serialize/lưu string UPPER_SNAKE_CASE CHƯA CHỐT (SSOT §7
// Open Questions), không tự quyết ở bước này.
public class SportHubDbContext : DbContext
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

    // 5) Training — Workout
    public DbSet<WorkoutPlan> WorkoutPlans => Set<WorkoutPlan>();
    public DbSet<WorkoutPlanItem> WorkoutPlanItems => Set<WorkoutPlanItem>();
    public DbSet<WorkoutResult> WorkoutResults => Set<WorkoutResult>();

    // 6) Payment
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAdjustment> PaymentAdjustments => Set<PaymentAdjustment>();

    // 7) AI
    public DbSet<AiLog> AiLogs => Set<AiLog>();

    // 8) Shared — Notification/AuditLog (module chưa gán chính thức, SSOT §7 Open Questions)
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // citext cho UserAccount.email — email không phân biệt hoa/thường (BR-1/BR-49,
        // ràng buộc #9 ở Design v2 §3). Alternative nêu trong doc là index LOWER(email);
        // chọn citext vì đơn giản hơn khi khai báo qua Fluent API và Postgres hỗ trợ sẵn.
        modelBuilder.HasPostgresExtension("citext");

        ConfigureIdentity(modelBuilder);
        ConfigureMembership(modelBuilder);
        ConfigureTraining(modelBuilder);
        ConfigureScheduling(modelBuilder);
        ConfigureWorkout(modelBuilder);
        ConfigurePayment(modelBuilder);
        ConfigureAiAndShared(modelBuilder);

        // TODO (chưa làm — SSOT §7 Open Questions, "không tự quyết"):
        // - Cơ chế serialize/lưu enum dạng string UPPER_SNAKE_CASE (JsonStringEnumConverter
        //   + naming policy, hay map thủ công ở DTO layer) — hiện enum vẫn lưu int (mặc định
        //   EF Core). Khi chốt, áp HasConversion<string>() (hoặc converter tương đương) cho
        //   TỪNG property enum bên dưới.
        // - Soft delete (is_deleted/deleted_at) — danh sách entity nào áp dụng chưa chốt (SSOT §5.5).
        // - Sinh Guid ở tầng nào (DB default gen_random_uuid() hay app layer) — SSOT §5.1.
    }

    // ---------------------------------------------------------------
    // 1) Identity/RBAC
    // ---------------------------------------------------------------
    private static void ConfigureIdentity(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(e => e.role_id);
            // Unique — 4 giá trị cố định, seed data (BR-55, ràng buộc #12).
            entity.HasIndex(e => e.role_name).IsUnique();
        });

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.HasKey(e => e.user_id);

            entity.Property(e => e.email).HasColumnType("citext");
            // Unique không phân biệt hoa/thường qua citext (BR-1/BR-49, ràng buộc #9).
            entity.HasIndex(e => e.email).IsUnique();

            entity.HasOne(e => e.Role)
                .WithMany(r => r.UserAccounts)
                .HasForeignKey(e => e.role_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserCredential>(entity =>
        {
            // PK trùng FK (1–1, dùng chung giá trị user_id với UserAccount).
            entity.HasKey(e => e.user_id);

            entity.HasOne(e => e.UserAccount)
                .WithOne(u => u.Credential)
                .HasForeignKey<UserCredential>(e => e.user_id)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserProfile>(entity =>
        {
            entity.HasKey(e => e.user_id);

            // Unique nếu có giá trị — partial unique index (BR-54, ràng buộc #11).
            entity.HasIndex(e => e.phone)
                .IsUnique()
                .HasFilter("phone IS NOT NULL");

            entity.HasOne(e => e.UserAccount)
                .WithOne(u => u.Profile)
                .HasForeignKey<UserProfile>(e => e.user_id)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserExternalLogin>(entity =>
        {
            entity.HasKey(e => e.external_login_id);

            // Ràng buộc #15: 1 tài khoản provider ngoài không link được vào 2 UserAccount.
            entity.HasIndex(e => new { e.provider, e.provider_user_id }).IsUnique();
            // Ràng buộc #16: 1 UserAccount không link trùng cùng 1 provider 2 lần.
            entity.HasIndex(e => new { e.user_id, e.provider }).IsUnique();

            entity.HasOne(e => e.UserAccount)
                .WithMany(u => u.ExternalLogins)
                .HasForeignKey(e => e.user_id)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    // ---------------------------------------------------------------
    // 2) Membership
    // ---------------------------------------------------------------
    private static void ConfigureMembership(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MembershipPackage>(entity =>
        {
            entity.HasKey(e => e.package_id);
            // Unique trong catalog (BR-56, ràng buộc #13).
            entity.HasIndex(e => e.name).IsUnique();
            // Tiền VND, số nguyên, không phần thập phân (SSOT §5.2).
            entity.Property(e => e.price).HasPrecision(18, 0);
        });

        modelBuilder.Entity<MemberPackage>(entity =>
        {
            entity.HasKey(e => e.member_package_id);

            // Optimistic concurrency — tránh lost-update (ràng buộc #8).
            entity.Property(e => e.version).IsConcurrencyToken();

            // Bảo vệ thêm ở tầng DB (không thay thế transaction atomic ở service layer,
            // xem Design v2 §3 ràng buộc #3): remaining_sessions không âm khi có giá trị.
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_member_packages_remaining_sessions_non_negative",
                "remaining_sessions IS NULL OR remaining_sessions >= 0"));

            entity.HasOne(e => e.Member)
                .WithMany()
                .HasForeignKey(e => e.member_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Package)
                .WithMany(p => p.MemberPackages)
                .HasForeignKey(e => e.package_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberTrainingProfile>(entity =>
        {
            entity.HasKey(e => e.profile_id);
            // Unique — 1 Member chỉ có 1 hồ sơ (ràng buộc 1–1 với UserAccount).
            entity.HasIndex(e => e.member_id).IsUnique();

            entity.HasOne(e => e.Member)
                .WithMany()
                .HasForeignKey(e => e.member_id)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ---------------------------------------------------------------
    // 3) Training — hồ sơ & quan hệ
    // ---------------------------------------------------------------
    private static void ConfigureTraining(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CoachMemberRelationship>(entity =>
        {
            entity.HasKey(e => e.relationship_id);

            // Ràng buộc #7: không tạo trùng quan hệ Coach–Member đang ACTIVE
            // (partial unique index, RelationshipStatus.Active = 0).
            entity.HasIndex(e => new { e.coach_id, e.member_id })
                .IsUnique()
                .HasFilter($"status = {(int)Enums.RelationshipStatus.Active}");

            entity.HasOne(e => e.Coach)
                .WithMany()
                .HasForeignKey(e => e.coach_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Member)
                .WithMany()
                .HasForeignKey(e => e.member_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Class)
                .WithMany(c => c.CoachMemberRelationships)
                .HasForeignKey(e => e.class_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ---------------------------------------------------------------
    // 4) Scheduling
    // ---------------------------------------------------------------
    private static void ConfigureScheduling(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Room>(entity =>
        {
            entity.HasKey(e => e.room_id);
            // Unique toàn trung tâm (BR-57, ràng buộc #14).
            entity.HasIndex(e => e.name).IsUnique();
        });

        modelBuilder.Entity<Class>(entity =>
        {
            entity.HasKey(e => e.class_id);

            entity.HasOne(e => e.DefaultRoom)
                .WithMany(r => r.Classes)
                .HasForeignKey(e => e.default_room_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.DefaultCoach)
                .WithMany()
                .HasForeignKey(e => e.default_coach_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ClassRecurrence>(entity =>
        {
            entity.HasKey(e => e.recurrence_id);

            entity.HasOne(e => e.Class)
                .WithMany(c => c.Recurrences)
                .HasForeignKey(e => e.class_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ClassSession>(entity =>
        {
            entity.HasKey(e => e.session_id);

            // Bảo vệ thêm ở tầng DB (không thay thế transaction atomic ở service layer,
            // xem Design v2 §3 ràng buộc #2): confirmed_count trong khoảng [0, capacity].
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_class_sessions_confirmed_count_within_capacity",
                "confirmed_count >= 0 AND confirmed_count <= capacity"));

            entity.HasOne(e => e.Class)
                .WithMany(c => c.Sessions)
                .HasForeignKey(e => e.class_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Recurrence)
                .WithMany(r => r.Sessions)
                .HasForeignKey(e => e.recurrence_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Room)
                .WithMany(r => r.Sessions)
                .HasForeignKey(e => e.room_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Coach)
                .WithMany()
                .HasForeignKey(e => e.coach_id)
                .OnDelete(DeleteBehavior.Restrict);

            // Self-reference — buổi được dời lịch trỏ về buổi gốc.
            entity.HasOne(e => e.RescheduledFromSession)
                .WithMany()
                .HasForeignKey(e => e.rescheduled_from_session_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Enrollment>(entity =>
        {
            entity.HasKey(e => e.enrollment_id);

            // Ràng buộc #1: không đăng ký trùng vào cùng 1 session (partial unique
            // index, EnrollmentStatus.Confirmed = 0) — cho phép đăng ký lại sau khi hủy.
            entity.HasIndex(e => new { e.session_id, e.member_id })
                .IsUnique()
                .HasFilter($"status = {(int)Enums.EnrollmentStatus.Confirmed}");

            entity.HasOne(e => e.Session)
                .WithMany(s => s.Enrollments)
                .HasForeignKey(e => e.session_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Member)
                .WithMany()
                .HasForeignKey(e => e.member_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.MemberPackage)
                .WithMany(mp => mp.Enrollments)
                .HasForeignKey(e => e.member_package_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.CancelledByUser)
                .WithMany()
                .HasForeignKey(e => e.cancelled_by_user_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Attendance>(entity =>
        {
            entity.HasKey(e => e.attendance_id);

            // Ràng buộc #17: 1 Enrollment chỉ có tối đa 1 Attendance (1-1).
            entity.HasIndex(e => e.enrollment_id).IsUnique();

            entity.HasOne(e => e.Enrollment)
                .WithOne(en => en.Attendance)
                .HasForeignKey<Attendance>(e => e.enrollment_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.CheckedInByUser)
                .WithMany()
                .HasForeignKey(e => e.checked_in_by_user_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ---------------------------------------------------------------
    // 5) Training — Workout
    // ---------------------------------------------------------------
    private static void ConfigureWorkout(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkoutPlan>(entity =>
        {
            entity.HasKey(e => e.plan_id);

            entity.HasOne(e => e.Member)
                .WithMany()
                .HasForeignKey(e => e.member_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Coach)
                .WithMany()
                .HasForeignKey(e => e.coach_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Relationship)
                .WithMany(r => r.WorkoutPlans)
                .HasForeignKey(e => e.relationship_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WorkoutPlanItem>(entity =>
        {
            entity.HasKey(e => e.item_id);

            // Bài tập con chỉ có ý nghĩa gắn với đúng 1 plan — cascade khi xóa plan.
            entity.HasOne(e => e.Plan)
                .WithMany(p => p.Items)
                .HasForeignKey(e => e.plan_id)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WorkoutResult>(entity =>
        {
            entity.HasKey(e => e.result_id);

            entity.HasOne(e => e.Enrollment)
                .WithMany(en => en.WorkoutResults)
                .HasForeignKey(e => e.enrollment_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Coach)
                .WithMany()
                .HasForeignKey(e => e.coach_id)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ---------------------------------------------------------------
    // 6) Payment
    // ---------------------------------------------------------------
    private static void ConfigurePayment(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.HasKey(e => e.invoice_id);
            // Unique, sinh từ DB sequence ở service layer, không random ở app (BR-58, ràng buộc #5).
            entity.HasIndex(e => e.invoice_number).IsUnique();
            entity.Property(e => e.total_amount).HasPrecision(18, 0);

            entity.HasOne(e => e.Member)
                .WithMany()
                .HasForeignKey(e => e.member_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.IssuedByUser)
                .WithMany()
                .HasForeignKey(e => e.issued_by_user_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.MemberPackage)
                .WithMany()
                .HasForeignKey(e => e.member_package_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InvoiceItem>(entity =>
        {
            entity.HasKey(e => e.item_id);
            entity.Property(e => e.amount).HasPrecision(18, 0);

            // Dòng chi tiết chỉ có ý nghĩa gắn với đúng 1 invoice — cascade khi xóa invoice
            // (Invoice về nguyên tắc không bao giờ bị xóa thật, BR-40).
            entity.HasOne(e => e.Invoice)
                .WithMany(i => i.Items)
                .HasForeignKey(e => e.invoice_id)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(e => e.payment_id);
            entity.Property(e => e.amount).HasPrecision(18, 0);

            entity.HasOne(e => e.Invoice)
                .WithMany(i => i.Payments)
                .HasForeignKey(e => e.invoice_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ReceivedByUser)
                .WithMany()
                .HasForeignKey(e => e.received_by_user_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PaymentAdjustment>(entity =>
        {
            entity.HasKey(e => e.adjustment_id);
            entity.Property(e => e.amount).HasPrecision(18, 0);

            entity.HasOne(e => e.Invoice)
                .WithMany(i => i.Adjustments)
                .HasForeignKey(e => e.invoice_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Payment)
                .WithMany(p => p.Adjustments)
                .HasForeignKey(e => e.payment_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.RequestedByUser)
                .WithMany()
                .HasForeignKey(e => e.requested_by_user_id)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ApprovedByUser)
                .WithMany()
                .HasForeignKey(e => e.approved_by_user_id)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ---------------------------------------------------------------
    // 7) AI  /  8) Shared (Notification, AuditLog — module chưa gán chính thức)
    // ---------------------------------------------------------------
    private static void ConfigureAiAndShared(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AiLog>(entity =>
        {
            entity.HasKey(e => e.log_id);
            entity.Property(e => e.input_payload).HasColumnType("jsonb");
            entity.Property(e => e.response_payload).HasColumnType("jsonb");

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.user_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.notification_id);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.user_id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.audit_id);
            entity.Property(e => e.old_value).HasColumnType("jsonb");
            entity.Property(e => e.new_value).HasColumnType("jsonb");

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.user_id)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
