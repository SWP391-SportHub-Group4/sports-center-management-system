using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.AI.Infrastructure.Persistence.Configurations;

public sealed class SystemPromptConfiguration : IEntityTypeConfiguration<SystemPrompt>
{
    public void Configure(EntityTypeBuilder<SystemPrompt> builder)
    {
        builder.ToTable("ai_system_prompts", table => {
            table.HasCheckConstraint("ck_ai_system_prompt_role",
                "(audience = 'Member' AND id IN ('member-rules-prompt','member-policies-prompt','member-procedures-prompt','member-general-prompt','member-api-prompt')) OR " +
                "(audience = 'Coach' AND id IN ('coach-rules-prompt','coach-policies-prompt','coach-procedures-prompt','coach-general-prompt','coach-api-prompt'))");
            table.HasCheckConstraint("ck_ai_system_prompt_history_limit", "jsonb_array_length(history_payload) <= 1");
        });
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id").HasMaxLength(64);
        builder.Property(p => p.Audience).HasColumnName("audience").HasMaxLength(16).IsRequired();
        builder.HasIndex(p => p.Audience);
        builder.Property(p => p.ActivePayload).HasColumnName("active_payload").HasColumnType("jsonb");
        builder.Property(p => p.DraftPayload).HasColumnName("draft_payload").HasColumnType("jsonb");
        builder.Property(p => p.HistoryPayload).HasColumnName("history_payload").HasColumnType("jsonb").IsRequired();
        builder.Property(p => p.Revision).HasColumnName("revision").IsConcurrencyToken();
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");
    }
}
