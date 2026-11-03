using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class SeparateAiPromptsByCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_ai_system_prompts_audience",
                table: "ai_system_prompts");

            migrationBuilder.DropCheckConstraint(
                name: "ck_ai_system_prompt_role",
                table: "ai_system_prompts");

            migrationBuilder.CreateIndex(
                name: "ix_ai_system_prompts_audience",
                table: "ai_system_prompts",
                column: "audience");
            // Preserve legacy Coach/Member prompts before enforcing the new IDs.
            migrationBuilder.Sql("""
                UPDATE ai_system_prompts
                SET id =
                    lower(audience) || '-' ||
                    lower(
                        CASE
                            WHEN COALESCE(
                                active_payload ->> 'category',
                                draft_payload ->> 'category'
                            ) IN ('Rules', 'Policies', 'Procedures', 'General', 'Api')
                            THEN COALESCE(
                                active_payload ->> 'category',
                                draft_payload ->> 'category'
                            )
                            ELSE 'General'
                        END
                    ) || '-prompt'
                WHERE id IN (
                    'coach-system-prompt',
                    'member-system-prompt'
                );
                """);
            migrationBuilder.AddCheckConstraint(
                name: "ck_ai_system_prompt_role",
                table: "ai_system_prompts",
                sql: "(audience = 'Member' AND id IN ('member-rules-prompt','member-policies-prompt','member-procedures-prompt','member-general-prompt','member-api-prompt')) OR (audience = 'Coach' AND id IN ('coach-rules-prompt','coach-policies-prompt','coach-procedures-prompt','coach-general-prompt','coach-api-prompt'))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_ai_system_prompts_audience",
                table: "ai_system_prompts");

            migrationBuilder.DropCheckConstraint(
                name: "ck_ai_system_prompt_role",
                table: "ai_system_prompts");

            migrationBuilder.CreateIndex(
                name: "ix_ai_system_prompts_audience",
                table: "ai_system_prompts",
                column: "audience",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_ai_system_prompt_role",
                table: "ai_system_prompts",
                sql: "(id = 'member-system-prompt' AND audience = 'Member') OR (id = 'coach-system-prompt' AND audience = 'Coach')");
        }
    }
}
