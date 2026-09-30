using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.API.Persistence;

// FK giữa các module chỉ ở dạng scalar (không navigation C#) — host là nơi duy nhất biết cả hai phía.
public static class CrossModuleRelationships
{
    public static void Configure(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SportHub.Payment.Wallet.Domain.PointWallet>()
            .HasOne<UserAccount>().WithMany().HasForeignKey(e => e.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Payment.Wallet.Domain.PointLedgerEntry>()
            .HasOne<UserAccount>().WithMany().HasForeignKey(e => e.ActorUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Payment.Wallet.Domain.PointConfirmation>()
            .HasOne<Invoice>().WithMany().HasForeignKey(e => e.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Payment.Wallet.Domain.PointConfirmation>()
            .HasOne<UserAccount>().WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Payment.Wallet.Domain.PointConfirmation>()
            .HasOne<UserAccount>().WithMany().HasForeignKey(e => e.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Membership.Domain.Entities.MemberPackage>()
            .HasOne<InvoiceItem>().WithMany().HasForeignKey(e => e.InvoiceItemId).OnDelete(DeleteBehavior.Restrict);
        // Chuyên môn của Coach/ExternalCoach trỏ tới môn trong catalog.
        modelBuilder.Entity<UserSportSpecialty>()
            .HasOne<Sport>()
            .WithMany()
            .HasForeignKey(e => e.SportId)
            .OnDelete(DeleteBehavior.Restrict);

        // Coach bị chiếm lịch là user_accounts (Coach nội bộ hoặc ExternalCoach).
        modelBuilder.Entity<CoachOccupancy>()
            .HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        // Khóa học: coach/member/người ghi là user_accounts; ghi danh gắn InvoiceItem, giữ chỗ gắn Invoice (Payment).
        modelBuilder.Entity<Class>().HasOne<UserAccount>().WithMany().HasForeignKey(e => e.CoachId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ClassSession>().HasOne<UserAccount>().WithMany().HasForeignKey(e => e.CoachId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Enrollment>().HasOne<UserAccount>().WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Enrollment>().HasOne<InvoiceItem>().WithMany().HasForeignKey(e => e.InvoiceItemId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Enrollment>().HasOne<InvoiceItem>().WithMany()
            .HasForeignKey(e => e.TransferDifferenceInvoiceItemId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Scheduling.Threshold.Domain.ThresholdResponse>()
            .HasOne<UserAccount>().WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SportHub.Scheduling.Threshold.Domain.ThresholdResponse>()
            .HasOne<Invoice>().WithMany().HasForeignKey(e => e.AdditionalInvoiceId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Attendance>().HasOne<UserAccount>().WithMany().HasForeignKey(e => e.RecordedByUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SeatHold>().HasOne<UserAccount>().WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SeatHold>().HasOne<Invoice>().WithMany().HasForeignKey(e => e.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<GymCheckIn>().HasOne<UserAccount>().WithMany().HasForeignKey(e => e.CheckedOutByUserId).OnDelete(DeleteBehavior.Restrict);

        // Buổi PT có thể gắn phòng (tùy chọn) — chiếm room occupancy khi có phòng.
        modelBuilder.Entity<SportHub.Training.Domain.Entities.PtSession>()
            .HasOne<Room>().WithMany().HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CourtRental>().HasOne<UserAccount>().WithMany()
            .HasForeignKey(e => e.ExternalCoachId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CourtRental>().HasOne<Sport>().WithMany()
            .HasForeignKey(e => e.SportId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CourtRental>().HasOne<Room>().WithMany()
            .HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CourtRental>().HasOne<InvoiceItem>().WithMany()
            .HasForeignKey(e => e.InvoiceItemId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CourtRental>().HasOne<Invoice>().WithMany()
            .HasForeignKey(e => e.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CourtRental>().HasOne<IncidentNotice>().WithMany()
            .HasForeignKey(e => e.CancellationIncidentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<IncidentNotice>().HasOne<UserAccount>().WithMany()
            .HasForeignKey(e => e.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<IncidentNotice>().HasOne<Room>().WithMany()
            .HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<RoomBlock>().HasOne<IncidentNotice>().WithMany()
            .HasForeignKey(e => e.IncidentId).OnDelete(DeleteBehavior.Restrict);
    }
}
