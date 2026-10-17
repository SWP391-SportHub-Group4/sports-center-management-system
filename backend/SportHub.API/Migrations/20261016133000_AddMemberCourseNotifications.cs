using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberCourseNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The earlier communication migration may already own the shared table.
            migrationBuilder.Sql("""
                ALTER TABLE course_interests ADD COLUMN IF NOT EXISTS sport_id integer;
                UPDATE course_interests i SET sport_id = c.sport_id FROM classes c WHERE c.class_id = i.source_class_id AND i.sport_id IS NULL;
                ALTER TABLE course_interests ALTER COLUMN sport_id SET NOT NULL;
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_course_interests_sports_sport_id') THEN
                        ALTER TABLE course_interests ADD CONSTRAINT fk_course_interests_sports_sport_id FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE RESTRICT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_course_interests_user_accounts_member_id') THEN
                        ALTER TABLE course_interests ADD CONSTRAINT fk_course_interests_user_accounts_member_id FOREIGN KEY (member_id) REFERENCES user_accounts(user_id) ON DELETE RESTRICT;
                    END IF;
                END $$;
                CREATE INDEX IF NOT EXISTS ix_course_interests_member_id ON course_interests (member_id);
                CREATE INDEX IF NOT EXISTS ix_course_interests_sport_id_cancelled_at_utc ON course_interests (sport_id, cancelled_at_utc);
                ALTER TABLE class_threshold_responses DROP CONSTRAINT IF EXISTS ck_class_threshold_response_choice_target;
                ALTER TABLE class_threshold_responses ADD CONSTRAINT ck_class_threshold_response_choice_target CHECK ((choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2, 3) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The earlier communication migration owns the shared table and its rows.
            migrationBuilder.Sql("""
                ALTER TABLE course_interests DROP CONSTRAINT IF EXISTS fk_course_interests_user_accounts_member_id;
                DROP INDEX IF EXISTS ix_course_interests_member_id;
                ALTER TABLE course_interests DROP COLUMN IF EXISTS sport_id;
                """);
        }
    }
}
