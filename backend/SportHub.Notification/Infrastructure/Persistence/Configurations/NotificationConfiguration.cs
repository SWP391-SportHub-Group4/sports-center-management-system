using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Notification.Infrastructure.Persistence.Configurations;

public class NotificationConfiguration : IEntityTypeConfiguration<Domain.Entities.Notification>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.Notification> builder)
    {
        builder.HasKey(e => e.NotificationId);

        builder.HasOne(e => e.User)
            .WithMany()
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.Property(e => e.RecipientAddress).HasMaxLength(320);
        builder.Property(e => e.ProtectedEmailPayload).HasColumnType("text");
        builder.Property(e => e.LastError).HasMaxLength(120);
        builder.HasIndex(e => new { e.SourceEventType, e.UserId, e.Channel, e.SourceEntityId })
            .IsUnique().HasFilter("user_id IS NOT NULL AND source_entity_id IS NOT NULL AND channel = 0")
            .HasDatabaseName("ux_notifications_inapp_event_recipient");
        builder.HasIndex(e => new { e.SourceEventType, e.RecipientAddress, e.Channel, e.SourceEntityId })
            .IsUnique().HasFilter("recipient_address IS NOT NULL AND source_entity_id IS NOT NULL AND channel = 1")
            .HasDatabaseName("ux_notifications_email_event_recipient");
    }
}
