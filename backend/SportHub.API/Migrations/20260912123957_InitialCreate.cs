using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:citext", ",,");

            migrationBuilder.CreateTable(
                name: "membership_packages",
                columns: table => new
                {
                    package_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    price = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    duration_days = table.Column<int>(type: "integer", nullable: false),
                    session_limit = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_membership_packages", x => x.package_id);
                });

            migrationBuilder.CreateTable(
                name: "roles",
                columns: table => new
                {
                    role_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    role_name = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_roles", x => x.role_id);
                });

            migrationBuilder.CreateTable(
                name: "rooms",
                columns: table => new
                {
                    room_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    capacity = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_rooms", x => x.room_id);
                });

            migrationBuilder.CreateTable(
                name: "user_accounts",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "citext", nullable: false),
                    role_id = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_accounts", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_user_accounts_roles_role_id",
                        column: x => x.role_id,
                        principalTable: "roles",
                        principalColumn: "role_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ai_logs",
                columns: table => new
                {
                    log_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    query_type = table.Column<string>(type: "text", nullable: false),
                    input_payload = table.Column<string>(type: "jsonb", nullable: false),
                    response_payload = table.Column<string>(type: "jsonb", nullable: false),
                    response_time_ms = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ai_logs", x => x.log_id);
                    table.ForeignKey(
                        name: "fk_ai_logs_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "audit_logs",
                columns: table => new
                {
                    audit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    target_entity = table.Column<string>(type: "text", nullable: false),
                    target_id = table.Column<Guid>(type: "uuid", nullable: false),
                    old_value = table.Column<string>(type: "jsonb", nullable: true),
                    new_value = table.Column<string>(type: "jsonb", nullable: true),
                    ip_address = table.Column<string>(type: "text", nullable: false),
                    timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_logs", x => x.audit_id);
                    table.ForeignKey(
                        name: "fk_audit_logs_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "classes",
                columns: table => new
                {
                    class_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    discipline = table.Column<string>(type: "text", nullable: false),
                    default_room_id = table.Column<int>(type: "integer", nullable: false),
                    default_coach_id = table.Column<Guid>(type: "uuid", nullable: true),
                    capacity = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_classes", x => x.class_id);
                    table.ForeignKey(
                        name: "fk_classes_rooms_default_room_id",
                        column: x => x.default_room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_classes_user_accounts_default_coach_id",
                        column: x => x.default_coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "member_packages",
                columns: table => new
                {
                    member_package_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    package_id = table.Column<int>(type: "integer", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: false),
                    remaining_sessions = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_packages", x => x.member_package_id);
                    table.CheckConstraint("CK_member_packages_remaining_sessions_non_negative", "remaining_sessions IS NULL OR remaining_sessions >= 0");
                    table.ForeignKey(
                        name: "fk_member_packages_membership_packages_package_id",
                        column: x => x.package_id,
                        principalTable: "membership_packages",
                        principalColumn: "package_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_member_packages_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "member_training_profiles",
                columns: table => new
                {
                    profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    goal = table.Column<string>(type: "text", nullable: false),
                    experience_level = table.Column<int>(type: "integer", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_training_profiles", x => x.profile_id);
                    table.ForeignKey(
                        name: "fk_member_training_profiles_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    channel = table.Column<int>(type: "integer", nullable: false),
                    source_event_type = table.Column<int>(type: "integer", nullable: false),
                    source_entity_id = table.Column<Guid>(type: "uuid", nullable: true),
                    message = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    retry_count = table.Column<int>(type: "integer", nullable: false),
                    last_attempt_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notifications", x => x.notification_id);
                    table.ForeignKey(
                        name: "fk_notifications_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_credentials",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_credentials", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_user_credentials_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_external_logins",
                columns: table => new
                {
                    external_login_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<int>(type: "integer", nullable: false),
                    provider_user_id = table.Column<string>(type: "text", nullable: false),
                    refresh_token = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_external_logins", x => x.external_login_id);
                    table.ForeignKey(
                        name: "fk_user_external_logins_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_profiles",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    full_name = table.Column<string>(type: "text", nullable: false),
                    phone = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_profiles", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_user_profiles_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "class_recurrences",
                columns: table => new
                {
                    recurrence_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    class_id = table.Column<int>(type: "integer", nullable: false),
                    days_of_week = table.Column<string>(type: "text", nullable: false),
                    start_time_local = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    end_time_local = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    timezone = table.Column<string>(type: "text", nullable: false),
                    effective_from = table.Column<DateOnly>(type: "date", nullable: false),
                    effective_to = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_recurrences", x => x.recurrence_id);
                    table.ForeignKey(
                        name: "fk_class_recurrences_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "coach_member_relationships",
                columns: table => new
                {
                    relationship_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_type = table.Column<int>(type: "integer", nullable: false),
                    class_id = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ended_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_member_relationships", x => x.relationship_id);
                    table.ForeignKey(
                        name: "fk_coach_member_relationships_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_coach_member_relationships_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_coach_member_relationships_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "invoices",
                columns: table => new
                {
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_number = table.Column<string>(type: "text", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    issued_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_package_id = table.Column<Guid>(type: "uuid", nullable: true),
                    total_amount = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invoices", x => x.invoice_id);
                    table.ForeignKey(
                        name: "fk_invoices_member_packages_member_package_id",
                        column: x => x.member_package_id,
                        principalTable: "member_packages",
                        principalColumn: "member_package_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_invoices_user_accounts_issued_by_user_id",
                        column: x => x.issued_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_invoices_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "class_sessions",
                columns: table => new
                {
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<int>(type: "integer", nullable: false),
                    recurrence_id = table.Column<int>(type: "integer", nullable: true),
                    room_id = table.Column<int>(type: "integer", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    capacity = table.Column<int>(type: "integer", nullable: false),
                    confirmed_count = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    rescheduled_from_session_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_sessions", x => x.session_id);
                    table.CheckConstraint("CK_class_sessions_confirmed_count_within_capacity", "confirmed_count >= 0 AND confirmed_count <= capacity");
                    table.ForeignKey(
                        name: "fk_class_sessions_class_recurrences_recurrence_id",
                        column: x => x.recurrence_id,
                        principalTable: "class_recurrences",
                        principalColumn: "recurrence_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_sessions_class_sessions_rescheduled_from_session_id",
                        column: x => x.rescheduled_from_session_id,
                        principalTable: "class_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_sessions_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_sessions_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_sessions_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workout_plans",
                columns: table => new
                {
                    plan_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    relationship_id = table.Column<Guid>(type: "uuid", nullable: false),
                    goal = table.Column<string>(type: "text", nullable: false),
                    level = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workout_plans", x => x.plan_id);
                    table.ForeignKey(
                        name: "fk_workout_plans_coach_member_relationships_relationship_id",
                        column: x => x.relationship_id,
                        principalTable: "coach_member_relationships",
                        principalColumn: "relationship_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_workout_plans_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_workout_plans_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "invoice_items",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    related_entity_type = table.Column<int>(type: "integer", nullable: false),
                    related_entity_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invoice_items", x => x.item_id);
                    table.ForeignKey(
                        name: "fk_invoice_items_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalTable: "invoices",
                        principalColumn: "invoice_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                columns: table => new
                {
                    payment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    method = table.Column<int>(type: "integer", nullable: false),
                    reference_code = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    received_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    paid_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payments", x => x.payment_id);
                    table.ForeignKey(
                        name: "fk_payments_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalTable: "invoices",
                        principalColumn: "invoice_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payments_user_accounts_received_by_user_id",
                        column: x => x.received_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "enrollments",
                columns: table => new
                {
                    enrollment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_package_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    registered_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancelled_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_enrollments", x => x.enrollment_id);
                    table.ForeignKey(
                        name: "fk_enrollments_class_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "class_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_enrollments_member_packages_member_package_id",
                        column: x => x.member_package_id,
                        principalTable: "member_packages",
                        principalColumn: "member_package_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_enrollments_user_accounts_cancelled_by_user_id",
                        column: x => x.cancelled_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_enrollments_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workout_plan_items",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    plan_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exercise = table.Column<string>(type: "text", nullable: false),
                    sets = table.Column<int>(type: "integer", nullable: false),
                    reps = table.Column<int>(type: "integer", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workout_plan_items", x => x.item_id);
                    table.ForeignKey(
                        name: "fk_workout_plan_items_workout_plans_plan_id",
                        column: x => x.plan_id,
                        principalTable: "workout_plans",
                        principalColumn: "plan_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "payment_adjustments",
                columns: table => new
                {
                    adjustment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    payment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<int>(type: "integer", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    approved_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    resolved_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payment_adjustments", x => x.adjustment_id);
                    table.ForeignKey(
                        name: "fk_payment_adjustments_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalTable: "invoices",
                        principalColumn: "invoice_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payment_adjustments_payments_payment_id",
                        column: x => x.payment_id,
                        principalTable: "payments",
                        principalColumn: "payment_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payment_adjustments_user_accounts_approved_by_user_id",
                        column: x => x.approved_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payment_adjustments_user_accounts_requested_by_user_id",
                        column: x => x.requested_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "attendances",
                columns: table => new
                {
                    attendance_id = table.Column<Guid>(type: "uuid", nullable: false),
                    enrollment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    check_in_time = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    checked_in_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_attendances", x => x.attendance_id);
                    table.ForeignKey(
                        name: "fk_attendances_enrollments_enrollment_id",
                        column: x => x.enrollment_id,
                        principalTable: "enrollments",
                        principalColumn: "enrollment_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_attendances_user_accounts_checked_in_by_user_id",
                        column: x => x.checked_in_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workout_results",
                columns: table => new
                {
                    result_id = table.Column<Guid>(type: "uuid", nullable: false),
                    enrollment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    progress_note = table.Column<string>(type: "text", nullable: true),
                    coach_comment = table.Column<string>(type: "text", nullable: true),
                    recorded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workout_results", x => x.result_id);
                    table.ForeignKey(
                        name: "fk_workout_results_enrollments_enrollment_id",
                        column: x => x.enrollment_id,
                        principalTable: "enrollments",
                        principalColumn: "enrollment_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_workout_results_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "role_id", "role_name" },
                values: new object[,]
                {
                    { 1, 0 },
                    { 2, 1 },
                    { 3, 2 },
                    { 4, 3 },
                    { 5, 4 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_ai_logs_user_id",
                table: "ai_logs",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_attendances_checked_in_by_user_id",
                table: "attendances",
                column: "checked_in_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_attendances_enrollment_id",
                table: "attendances",
                column: "enrollment_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_user_id",
                table: "audit_logs",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_recurrences_class_id",
                table: "class_recurrences",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_class_id",
                table: "class_sessions",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_coach_id",
                table: "class_sessions",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_recurrence_id",
                table: "class_sessions",
                column: "recurrence_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_rescheduled_from_session_id",
                table: "class_sessions",
                column: "rescheduled_from_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_room_id",
                table: "class_sessions",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "ix_classes_default_coach_id",
                table: "classes",
                column: "default_coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_classes_default_room_id",
                table: "classes",
                column: "default_room_id");

            migrationBuilder.CreateIndex(
                name: "ix_coach_member_relationships_class_id",
                table: "coach_member_relationships",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_coach_member_relationships_coach_id_member_id",
                table: "coach_member_relationships",
                columns: new[] { "coach_id", "member_id" },
                unique: true,
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ix_coach_member_relationships_member_id",
                table: "coach_member_relationships",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_enrollments_cancelled_by_user_id",
                table: "enrollments",
                column: "cancelled_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_enrollments_member_id",
                table: "enrollments",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_enrollments_member_package_id",
                table: "enrollments",
                column: "member_package_id");

            migrationBuilder.CreateIndex(
                name: "ix_enrollments_session_id_member_id",
                table: "enrollments",
                columns: new[] { "session_id", "member_id" },
                unique: true,
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_invoice_id",
                table: "invoice_items",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_invoice_number",
                table: "invoices",
                column: "invoice_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_invoices_issued_by_user_id",
                table: "invoices",
                column: "issued_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_member_id",
                table: "invoices",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_member_package_id",
                table: "invoices",
                column: "member_package_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_packages_member_id",
                table: "member_packages",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_packages_package_id",
                table: "member_packages",
                column: "package_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_training_profiles_member_id",
                table: "member_training_profiles",
                column: "member_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_membership_packages_name",
                table: "membership_packages",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notifications_user_id",
                table: "notifications",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_approved_by_user_id",
                table: "payment_adjustments",
                column: "approved_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_invoice_id",
                table: "payment_adjustments",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_payment_id",
                table: "payment_adjustments",
                column: "payment_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_requested_by_user_id",
                table: "payment_adjustments",
                column: "requested_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_invoice_id",
                table: "payments",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_received_by_user_id",
                table: "payments",
                column: "received_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_roles_role_name",
                table: "roles",
                column: "role_name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_rooms_name",
                table: "rooms",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_accounts_email",
                table: "user_accounts",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_accounts_role_id",
                table: "user_accounts",
                column: "role_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_external_logins_provider_provider_user_id",
                table: "user_external_logins",
                columns: new[] { "provider", "provider_user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_external_logins_user_id_provider",
                table: "user_external_logins",
                columns: new[] { "user_id", "provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_profiles_phone",
                table: "user_profiles",
                column: "phone",
                unique: true,
                filter: "phone IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_workout_plan_items_plan_id",
                table: "workout_plan_items",
                column: "plan_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_plans_coach_id",
                table: "workout_plans",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_plans_member_id",
                table: "workout_plans",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_plans_relationship_id",
                table: "workout_plans",
                column: "relationship_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_results_coach_id",
                table: "workout_results",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_results_enrollment_id",
                table: "workout_results",
                column: "enrollment_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_logs");

            migrationBuilder.DropTable(
                name: "attendances");

            migrationBuilder.DropTable(
                name: "audit_logs");

            migrationBuilder.DropTable(
                name: "invoice_items");

            migrationBuilder.DropTable(
                name: "member_training_profiles");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "payment_adjustments");

            migrationBuilder.DropTable(
                name: "user_credentials");

            migrationBuilder.DropTable(
                name: "user_external_logins");

            migrationBuilder.DropTable(
                name: "user_profiles");

            migrationBuilder.DropTable(
                name: "workout_plan_items");

            migrationBuilder.DropTable(
                name: "workout_results");

            migrationBuilder.DropTable(
                name: "payments");

            migrationBuilder.DropTable(
                name: "workout_plans");

            migrationBuilder.DropTable(
                name: "enrollments");

            migrationBuilder.DropTable(
                name: "invoices");

            migrationBuilder.DropTable(
                name: "coach_member_relationships");

            migrationBuilder.DropTable(
                name: "class_sessions");

            migrationBuilder.DropTable(
                name: "member_packages");

            migrationBuilder.DropTable(
                name: "class_recurrences");

            migrationBuilder.DropTable(
                name: "membership_packages");

            migrationBuilder.DropTable(
                name: "classes");

            migrationBuilder.DropTable(
                name: "rooms");

            migrationBuilder.DropTable(
                name: "user_accounts");

            migrationBuilder.DropTable(
                name: "roles");
        }
    }
}
