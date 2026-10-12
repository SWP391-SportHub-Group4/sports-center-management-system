using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class MemberSupportRequestConfiguration
    : IEntityTypeConfiguration<MemberSupportRequest>
{
    public void Configure(
        EntityTypeBuilder<MemberSupportRequest> builder)
    {
        builder.ToTable("member_support_requests");

        builder.HasKey(x => x.RequestId);

        builder.Property(x => x.Category)
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(x => x.Subject)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(x => x.Description)
            .HasMaxLength(2000)
            .IsRequired();

        builder.Property(x => x.Status)
            .HasMaxLength(20)
            .IsRequired();

        builder.HasIndex(x => new
        {
            x.MemberId,
            x.CreatedAt
        });

        builder.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(x => x.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(x => x.RecordedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}