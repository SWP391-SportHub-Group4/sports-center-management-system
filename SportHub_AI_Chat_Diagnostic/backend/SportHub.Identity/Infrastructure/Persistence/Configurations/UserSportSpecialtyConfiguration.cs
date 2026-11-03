using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class UserSportSpecialtyConfiguration : IEntityTypeConfiguration<UserSportSpecialty>
{
    public void Configure(EntityTypeBuilder<UserSportSpecialty> builder)
    {
        // PK ghép cũng là UNIQUE (user_id, sport_id) — chuyên môn không trùng.
        builder.HasKey(e => new { e.UserId, e.SportId });

        builder.HasOne(e => e.UserAccount)
            .WithMany()
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.SportId);
    }
}
