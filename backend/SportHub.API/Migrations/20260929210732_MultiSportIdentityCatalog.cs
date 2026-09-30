using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class MultiSportIdentityCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_email_otps_email",
                table: "email_otps");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,")
                .Annotation("Npgsql:PostgresExtension:citext", ",,")
                .OldAnnotation("Npgsql:PostgresExtension:citext", ",,");

            migrationBuilder.AddColumn<Guid>(
                name: "security_stamp",
                table: "user_accounts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // Mỗi user hiện hữu một stamp riêng (không dùng chung giá trị mặc định toàn 0).
            migrationBuilder.Sql("UPDATE user_accounts SET security_stamp = gen_random_uuid();");

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "rooms",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "room_type_id",
                table: "rooms",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "purpose",
                table: "email_otps",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "coach_occupancies",
                columns: table => new
                {
                    occupancy_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_type = table.Column<int>(type: "integer", nullable: false),
                    source_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_occupancies", x => x.occupancy_id);
                    table.CheckConstraint("ck_coach_occupancies_range", "end_at_utc > start_at_utc");
                    table.ForeignKey(
                        name: "fk_coach_occupancies_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "external_coach_profiles",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    bio = table.Column<string>(type: "text", nullable: true),
                    approval_status = table.Column<int>(type: "integer", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    review_note = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_external_coach_profiles", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_external_coach_profiles_user_accounts_reviewed_by_user_id",
                        column: x => x.reviewed_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_external_coach_profiles_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "room_blocks",
                columns: table => new
                {
                    block_id = table.Column<Guid>(type: "uuid", nullable: false),
                    room_id = table.Column<int>(type: "integer", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    incident_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_room_blocks", x => x.block_id);
                    table.CheckConstraint("ck_room_blocks_range", "end_at_utc > start_at_utc");
                    table.ForeignKey(
                        name: "fk_room_blocks_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "room_occupancies",
                columns: table => new
                {
                    occupancy_id = table.Column<Guid>(type: "uuid", nullable: false),
                    room_id = table.Column<int>(type: "integer", nullable: false),
                    source_type = table.Column<int>(type: "integer", nullable: false),
                    source_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_room_occupancies", x => x.occupancy_id);
                    table.CheckConstraint("ck_room_occupancies_range", "end_at_utc > start_at_utc");
                    table.ForeignKey(
                        name: "fk_room_occupancies_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "room_opening_hours",
                columns: table => new
                {
                    room_id = table.Column<int>(type: "integer", nullable: false),
                    day_of_week = table.Column<int>(type: "integer", nullable: false),
                    open_time_local = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    close_time_local = table.Column<TimeOnly>(type: "time without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_room_opening_hours", x => new { x.room_id, x.day_of_week });
                    table.CheckConstraint("ck_room_opening_hours_day", "day_of_week BETWEEN 0 AND 6");
                    table.CheckConstraint("ck_room_opening_hours_range", "close_time_local > open_time_local");
                    table.ForeignKey(
                        name: "fk_room_opening_hours_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "room_types",
                columns: table => new
                {
                    room_type_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "citext", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_room_types", x => x.room_type_id);
                });

            migrationBuilder.CreateTable(
                name: "sports",
                columns: table => new
                {
                    sport_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "citext", nullable: false),
                    operation_type = table.Column<int>(type: "integer", nullable: false),
                    default_session_minutes = table.Column<int>(type: "integer", nullable: true),
                    default_max_capacity = table.Column<int>(type: "integer", nullable: true),
                    description = table.Column<string>(type: "text", nullable: true),
                    image_url = table.Column<string>(type: "text", nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sports", x => x.sport_id);
                    table.CheckConstraint("ck_sports_default_capacity", "default_max_capacity IS NULL OR default_max_capacity > 0");
                    table.CheckConstraint("ck_sports_default_minutes", "default_session_minutes IS NULL OR default_session_minutes > 0");
                    table.CheckConstraint("ck_sports_group_course_defaults", "operation_type <> 2 OR (default_session_minutes IS NOT NULL AND default_max_capacity IS NOT NULL)");
                });

            migrationBuilder.CreateTable(
                name: "court_rates",
                columns: table => new
                {
                    rate_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    room_type_id = table.Column<int>(type: "integer", nullable: false),
                    sport_id = table.Column<int>(type: "integer", nullable: true),
                    days_of_week = table.Column<string>(type: "text", nullable: false),
                    start_time_local = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    end_time_local = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    price_per_hour = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_court_rates", x => x.rate_id);
                    table.CheckConstraint("ck_court_rates_price", "price_per_hour > 0 AND price_per_hour % 1000 = 0");
                    table.CheckConstraint("ck_court_rates_range", "end_time_local > start_time_local");
                    table.ForeignKey(
                        name: "fk_court_rates_room_types_room_type_id",
                        column: x => x.room_type_id,
                        principalTable: "room_types",
                        principalColumn: "room_type_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_court_rates_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sport_room_types",
                columns: table => new
                {
                    sport_id = table.Column<int>(type: "integer", nullable: false),
                    room_type_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sport_room_types", x => new { x.sport_id, x.room_type_id });
                    table.ForeignKey(
                        name: "fk_sport_room_types_room_types_room_type_id",
                        column: x => x.room_type_id,
                        principalTable: "room_types",
                        principalColumn: "room_type_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_sport_room_types_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_sport_specialties",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sport_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_sport_specialties", x => new { x.user_id, x.sport_id });
                    table.ForeignKey(
                        name: "fk_user_sport_specialties_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_sport_specialties_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "role_id", "role_name" },
                values: new object[] { 6, 5 });

            migrationBuilder.InsertData(
                table: "room_types",
                columns: new[] { "room_type_id", "name" },
                values: new object[,]
                {
                    { 1, "Phòng Gym" },
                    { 2, "Phòng PT" },
                    { 3, "Sân cầu lông" },
                    { 4, "Sân bóng rổ" }
                });

            migrationBuilder.InsertData(
                table: "sports",
                columns: new[] { "sport_id", "default_max_capacity", "default_session_minutes", "description", "image_url", "is_active", "name", "operation_type", "sort_order" },
                values: new object[,]
                {
                    { 1, null, null, null, null, true, "Gym", 0, 1 },
                    { 2, null, null, null, null, true, "Personal Training", 1, 2 },
                    { 3, 12, 90, null, null, true, "Cầu lông", 2, 3 },
                    { 4, 20, 120, null, null, true, "Bóng rổ", 2, 4 }
                });

            migrationBuilder.InsertData(
                table: "sport_room_types",
                columns: new[] { "room_type_id", "sport_id" },
                values: new object[,]
                {
                    { 1, 1 },
                    { 2, 2 },
                    { 3, 3 },
                    { 4, 4 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_rooms_room_type_id",
                table: "rooms",
                column: "room_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_email_otps_email_purpose",
                table: "email_otps",
                columns: new[] { "email", "purpose" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_coach_occupancies_coach_id_start_at_utc",
                table: "coach_occupancies",
                columns: new[] { "coach_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_coach_occupancies_source_type_source_id",
                table: "coach_occupancies",
                columns: new[] { "source_type", "source_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_court_rates_room_type_id_is_active",
                table: "court_rates",
                columns: new[] { "room_type_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "ix_court_rates_sport_id",
                table: "court_rates",
                column: "sport_id");

            migrationBuilder.CreateIndex(
                name: "ix_external_coach_profiles_approval_status",
                table: "external_coach_profiles",
                column: "approval_status");

            migrationBuilder.CreateIndex(
                name: "ix_external_coach_profiles_reviewed_by_user_id",
                table: "external_coach_profiles",
                column: "reviewed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_room_blocks_room_id_start_at_utc",
                table: "room_blocks",
                columns: new[] { "room_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_room_occupancies_room_id_start_at_utc",
                table: "room_occupancies",
                columns: new[] { "room_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_room_occupancies_source_type_source_id",
                table: "room_occupancies",
                columns: new[] { "source_type", "source_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_room_types_name",
                table: "room_types",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sport_room_types_room_type_id",
                table: "sport_room_types",
                column: "room_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_sports_name",
                table: "sports",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_sport_specialties_sport_id",
                table: "user_sport_specialties",
                column: "sport_id");

            migrationBuilder.AddForeignKey(
                name: "fk_rooms_room_types_room_type_id",
                table: "rooms",
                column: "room_type_id",
                principalTable: "room_types",
                principalColumn: "room_type_id",
                onDelete: ReferentialAction.Restrict);

            // Chống trùng lịch do DB: hai khoảng [start, end) chồng nhau trên cùng phòng/coach bị chặn (SQLSTATE 23P01);
            // liền kề (end = start kế tiếp) hợp lệ. Chỉ dòng đang chiếm chỗ (is_active) mới tính.
            migrationBuilder.Sql(
                """
                ALTER TABLE room_occupancies
                    ADD CONSTRAINT ex_room_occupancies_no_overlap
                    EXCLUDE USING gist (room_id WITH =, tstzrange(start_at_utc, end_at_utc, '[)') WITH &&)
                    WHERE (is_active);
                ALTER TABLE coach_occupancies
                    ADD CONSTRAINT ex_coach_occupancies_no_overlap
                    EXCLUDE USING gist (coach_id WITH =, tstzrange(start_at_utc, end_at_utc, '[)') WITH &&)
                    WHERE (is_active);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_rooms_room_types_room_type_id",
                table: "rooms");

            migrationBuilder.DropTable(
                name: "coach_occupancies");

            migrationBuilder.DropTable(
                name: "court_rates");

            migrationBuilder.DropTable(
                name: "external_coach_profiles");

            migrationBuilder.DropTable(
                name: "room_blocks");

            migrationBuilder.DropTable(
                name: "room_occupancies");

            migrationBuilder.DropTable(
                name: "room_opening_hours");

            migrationBuilder.DropTable(
                name: "sport_room_types");

            migrationBuilder.DropTable(
                name: "user_sport_specialties");

            migrationBuilder.DropTable(
                name: "room_types");

            migrationBuilder.DropTable(
                name: "sports");

            migrationBuilder.DropIndex(
                name: "ix_rooms_room_type_id",
                table: "rooms");

            migrationBuilder.DropIndex(
                name: "ix_email_otps_email_purpose",
                table: "email_otps");

            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "role_id",
                keyValue: 6);

            migrationBuilder.DropColumn(
                name: "security_stamp",
                table: "user_accounts");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "rooms");

            migrationBuilder.DropColumn(
                name: "room_type_id",
                table: "rooms");

            migrationBuilder.DropColumn(
                name: "purpose",
                table: "email_otps");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:citext", ",,")
                .OldAnnotation("Npgsql:PostgresExtension:btree_gist", ",,")
                .OldAnnotation("Npgsql:PostgresExtension:citext", ",,");

            migrationBuilder.CreateIndex(
                name: "ix_email_otps_email",
                table: "email_otps",
                column: "email",
                unique: true);
        }
    }
}
