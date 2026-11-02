using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class KeepPreviousPublishedPrompt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Keep the newest actual publication before the active version.
            // Draft snapshots and the active version itself are not history.
            migrationBuilder.Sql("""
                UPDATE ai_system_prompts AS prompt
                SET history_payload = COALESCE((
                    SELECT jsonb_agg(previous.item)
                    FROM (
                        SELECT entry.item
                        FROM jsonb_array_elements(prompt.history_payload) AS entry(item)
                        WHERE prompt.active_payload IS NOT NULL
                          AND entry.item->>'action' IN ('Initial', 'Publish', 'Restore')
                          AND (entry.item->>'version')::int < (prompt.active_payload->>'version')::int
                        ORDER BY (entry.item->>'version')::int DESC
                        LIMIT 1
                    ) AS previous
                ), '[]'::jsonb);
                """);
            migrationBuilder.AddCheckConstraint(
                name: "ck_ai_system_prompt_history_limit",
                table: "ai_system_prompts",
                sql: "jsonb_array_length(history_payload) <= 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_ai_system_prompt_history_limit",
                table: "ai_system_prompts");
        }
    }
}
