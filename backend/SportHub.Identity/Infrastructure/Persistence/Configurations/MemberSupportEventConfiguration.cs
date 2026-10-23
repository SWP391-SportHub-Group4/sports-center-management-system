using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class MemberSupportEventConfiguration : IEntityTypeConfiguration<MemberSupportEvent>
{
    public void Configure(EntityTypeBuilder<MemberSupportEvent> builder)
    {
        builder.ToTable("member_support_events");
        builder.HasKey(x => x.EventId);
        builder.Property(x => x.Type).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(1000);
        builder.HasIndex(x => new { x.RequestId, x.CreatedAt });
        builder.HasOne<MemberSupportRequest>()
            .WithMany()
            .HasForeignKey(x => x.RequestId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
