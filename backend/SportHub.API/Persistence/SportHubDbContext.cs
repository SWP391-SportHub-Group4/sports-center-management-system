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

    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();
    public DbSet<UserCredential> UserCredentials => Set<UserCredential>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<UserExternalLogin> UserExternalLogins => Set<UserExternalLogin>();
    public DbSet<EmailOtp> EmailOtps => Set<EmailOtp>();
    public DbSet<GoogleOnboardingTicket> GoogleOnboardingTickets => Set<GoogleOnboardingTicket>();
    public DbSet<CoachProfile> CoachProfiles => Set<CoachProfile>();

    public DbSet<MembershipPackage> MembershipPackages => Set<MembershipPackage>();
    public DbSet<MemberPackage> MemberPackages => Set<MemberPackage>();
    public DbSet<MemberTrainingProfile> MemberTrainingProfiles => Set<MemberTrainingProfile>();

    public DbSet<CoachMemberRelationship> CoachMemberRelationships => Set<CoachMemberRelationship>();

    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Class> Classes => Set<Class>();
    public DbSet<ClassRecurrence> ClassRecurrences => Set<ClassRecurrence>();
    public DbSet<ClassSession> ClassSessions => Set<ClassSession>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<GymCheckIn> GymCheckIns => Set<GymCheckIn>();

    public DbSet<WorkoutPlan> WorkoutPlans => Set<WorkoutPlan>();
    public DbSet<WorkoutPlanItem> WorkoutPlanItems => Set<WorkoutPlanItem>();
    public DbSet<WorkoutResult> WorkoutResults => Set<WorkoutResult>();

    // Mới 29/09/2026 (BE-4).
    public DbSet<PtEntitlement> PtEntitlements => Set<PtEntitlement>();
    public DbSet<PtSession> PtSessions => Set<PtSession>();
    public DbSet<PtSessionChangeRequest> PtSessionChangeRequests => Set<PtSessionChangeRequest>();
    public DbSet<PtCoachChangeRequest> PtCoachChangeRequests => Set<PtCoachChangeRequest>();
    public DbSet<HomeworkAssignment> HomeworkAssignments => Set<HomeworkAssignment>();
    public DbSet<HomeworkAssignmentItem> HomeworkAssignmentItems => Set<HomeworkAssignmentItem>();

    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<SportHub.Payment.Domain.Entities.Payment> Payments => Set<SportHub.Payment.Domain.Entities.Payment>();
    public DbSet<PaymentAdjustment> PaymentAdjustments => Set<PaymentAdjustment>();
    public DbSet<PaymentAttempt> PaymentAttempts => Set<PaymentAttempt>();

    public DbSet<AiLog> AiLogs => Set<AiLog>();

    public DbSet<SportHub.Notification.Domain.Entities.Notification> Notifications => Set<SportHub.Notification.Domain.Entities.Notification>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<ReportExport> ReportExports => Set<ReportExport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

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

        modelBuilder.HasSequence<long>(Payment.Infrastructure.InvoiceNumberGenerator.SequenceName)
            .StartsAt(1)
            .IncrementsBy(1);
    }
}
