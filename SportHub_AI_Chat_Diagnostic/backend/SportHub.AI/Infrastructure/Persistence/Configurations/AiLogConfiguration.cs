using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.AI.Infrastructure.Persistence.Configurations;

public class AiLogConfiguration : IEntityTypeConfiguration<AiLog>
{
    public void Configure(EntityTypeBuilder<AiLog> builder)
    {
        builder.HasKey(e => e.LogId);
        builder.Property(e => e.InputPayload).HasColumnType("jsonb");
        builder.Property(e => e.ResponsePayload).HasColumnType("jsonb");

        builder.HasOne(e => e.User)
            .WithMany()
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
