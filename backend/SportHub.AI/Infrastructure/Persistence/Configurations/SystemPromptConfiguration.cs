using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.AI.Infrastructure.Persistence.Configurations;

public sealed class SystemPromptConfiguration : IEntityTypeConfiguration<SystemPrompt>
{
    public void Configure(EntityTypeBuilder<SystemPrompt> builder)
    {
        builder.ToTable("ai_system_prompts", table => {
            table.HasCheckConstraint("ck_ai_system_prompt_role",
                "(id = 'member-system-prompt' AND audience = 'Member') OR (id = 'coach-system-prompt' AND audience = 'Coach')");
            table.HasCheckConstraint("ck_ai_system_prompt_history_limit", "jsonb_array_length(history_payload) <= 1");
        });
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id").HasMaxLength(64);
        builder.Property(p => p.Audience).HasColumnName("audience").HasMaxLength(16).IsRequired();
        builder.HasIndex(p => p.Audience).IsUnique();
        builder.Property(p => p.ActivePayload).HasColumnName("active_payload").HasColumnType("jsonb");
        builder.Property(p => p.DraftPayload).HasColumnName("draft_payload").HasColumnType("jsonb");
        builder.Property(p => p.HistoryPayload).HasColumnName("history_payload").HasColumnType("jsonb").IsRequired();
        builder.Property(p => p.Revision).HasColumnName("revision").IsConcurrencyToken();
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");
    }
}
