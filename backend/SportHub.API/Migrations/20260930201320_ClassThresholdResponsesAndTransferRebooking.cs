using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class ClassThresholdResponsesAndTransferRebooking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_enrollments_invoice_item",
                table: "enrollments");

            migrationBuilder.CreateTable(
                name: "class_threshold_responses",
                columns: table => new
                {
                    threshold_response_id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<int>(type: "integer", nullable: false),
                    enrollment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    deadline_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    choice = table.Column<int>(type: "integer", nullable: true),
                    target_class_id = table.Column<int>(type: "integer", nullable: true),
                    resolution_status = table.Column<int>(type: "integer", nullable: false),
                    additional_invoice_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    responded_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    resolved_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_threshold_responses", x => x.threshold_response_id);
                    table.CheckConstraint("ck_class_threshold_response_choice_target", "(choice IS NULL AND target_class_id IS NULL) OR (choice = 0 AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_class_threshold_responses_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_threshold_responses_classes_target_class_id",
                        column: x => x.target_class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_threshold_responses_enrollments_enrollment_id",
                        column: x => x.enrollment_id,
                        principalTable: "enrollments",
                        principalColumn: "enrollment_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_threshold_responses_invoices_additional_invoice_id",
                        column: x => x.additional_invoice_id,
                        principalTable: "invoices",
                        principalColumn: "invoice_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_threshold_responses_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_enrollments_invoice_item",
                table: "enrollments",
                column: "invoice_item_id",
                unique: true,
                filter: "invoice_item_id IS NOT NULL AND status = 0");

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_additional_invoice_id",
                table: "class_threshold_responses",
                column: "additional_invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_class_id_enrollment_id",
                table: "class_threshold_responses",
                columns: new[] { "class_id", "enrollment_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_enrollment_id",
                table: "class_threshold_responses",
                column: "enrollment_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_member_id",
                table: "class_threshold_responses",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_resolution_status_deadline_utc",
                table: "class_threshold_responses",
                columns: new[] { "resolution_status", "deadline_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_target_class_id",
                table: "class_threshold_responses",
                column: "target_class_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_threshold_responses_token_hash",
                table: "class_threshold_responses",
                column: "token_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "class_threshold_responses");

            migrationBuilder.DropIndex(
                name: "ux_enrollments_invoice_item",
                table: "enrollments");

            migrationBuilder.CreateIndex(
                name: "ux_enrollments_invoice_item",
                table: "enrollments",
                column: "invoice_item_id",
                unique: true,
                filter: "invoice_item_id IS NOT NULL");
        }
    }
}
