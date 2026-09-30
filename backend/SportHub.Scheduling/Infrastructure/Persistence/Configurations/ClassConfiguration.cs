using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassConfiguration : IEntityTypeConfiguration<Class>
{
    public void Configure(EntityTypeBuilder<Class> builder)
    {
        builder.ToTable("classes", t =>
        {
            t.HasCheckConstraint("ck_classes_capacity", "capacity > 0");
            t.HasCheckConstraint("ck_classes_num_sessions", "num_sessions > 0");
            // Chốt chặn overbooking ở DB (BR-51/115): 0 <= confirmed <= reserved <= capacity.
            t.HasCheckConstraint("ck_classes_counts", "confirmed_count >= 0 AND confirmed_count <= reserved_count AND reserved_count <= capacity");
            t.HasCheckConstraint("ck_classes_price", "price > 0 AND price % 1000 = 0");
            t.HasCheckConstraint("ck_classes_cost", "cost_amount >= 0");
        });

        builder.HasKey(e => e.ClassId);

        builder.Property(e => e.Code).IsRequired();
        builder.HasIndex(e => e.Code).IsUnique();
        builder.Property(e => e.Name).IsRequired();

        builder.Property(e => e.Price).HasPrecision(18, 0);
        builder.Property(e => e.CostAmount).HasPrecision(18, 0);
        builder.Property(e => e.Version).IsConcurrencyToken();

        builder.HasOne(e => e.Sport).WithMany().HasForeignKey(e => e.SportId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.DefaultRoom).WithMany().HasForeignKey(e => e.DefaultRoomId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.SportId, e.Status });
        builder.HasIndex(e => e.Status);
    }
}
