using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class MultiSportWallet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "point_wallets",
                columns: table => new
                {
                    wallet_id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    available_points = table.Column<int>(type: "integer", nullable: false),
                    held_points = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_point_wallets", x => x.wallet_id);
                    table.CheckConstraint("ck_point_wallets_balance", "available_points >= 0 AND held_points >= 0");
                    table.ForeignKey(
                        name: "fk_point_wallets_user_accounts_owner_user_id",
                        column: x => x.owner_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "point_ledger_entries",
                columns: table => new
                {
                    ledger_entry_id = table.Column<Guid>(type: "uuid", nullable: false),
                    wallet_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entry_type = table.Column<int>(type: "integer", nullable: false),
                    points = table.Column<int>(type: "integer", nullable: false),
                    available_delta = table.Column<int>(type: "integer", nullable: false),
                    held_delta = table.Column<int>(type: "integer", nullable: false),
                    available_after = table.Column<int>(type: "integer", nullable: false),
                    held_after = table.Column<int>(type: "integer", nullable: false),
                    reference_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    reference_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_point_ledger_entries", x => x.ledger_entry_id);
                    table.CheckConstraint("ck_point_ledger_balance", "available_after >= 0 AND held_after >= 0 AND points > 0");
                    table.CheckConstraint("ck_point_ledger_deltas", "(entry_type = 0 AND available_delta = -points AND held_delta = points) OR\n(entry_type = 1 AND available_delta = points AND held_delta = -points) OR\n(entry_type = 2 AND available_delta = 0 AND held_delta = -points) OR\n(entry_type = 3 AND available_delta = points AND held_delta = 0) OR\n(entry_type = 4 AND held_delta = 0 AND (available_delta = points OR available_delta = -points))");
                    table.ForeignKey(
                        name: "fk_point_ledger_entries_point_wallets_wallet_id",
                        column: x => x.wallet_id,
                        principalTable: "point_wallets",
                        principalColumn: "wallet_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_point_ledger_entries_user_accounts_actor_user_id",
                        column: x => x.actor_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_actor_user_id",
                table: "point_ledger_entries",
                column: "actor_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_wallet_id_created_at_utc_ledger_entry_",
                table: "point_ledger_entries",
                columns: new[] { "wallet_id", "created_at_utc", "ledger_entry_id" });

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_",
                table: "point_ledger_entries",
                columns: new[] { "wallet_id", "reference_type", "reference_id", "entry_type" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_point_wallets_owner_user_id",
                table: "point_wallets",
                column: "owner_user_id",
                unique: true);

            migrationBuilder.Sql("""
                INSERT INTO point_wallets (wallet_id, owner_user_id, available_points, held_points, created_at_utc)
                SELECT gen_random_uuid(), u.user_id, 0, 0, CURRENT_TIMESTAMP
                FROM user_accounts u JOIN roles r ON r.role_id = u.role_id
                WHERE r.role_name IN (2, 5)
                ON CONFLICT (owner_user_id) DO NOTHING;

                CREATE FUNCTION reject_point_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'Point ledger is append-only' USING ERRCODE = '23514';
                END $$;
                CREATE TRIGGER point_ledger_append_only BEFORE UPDATE OR DELETE ON point_ledger_entries
                FOR EACH ROW EXECUTE FUNCTION reject_point_ledger_mutation();
                CREATE TRIGGER point_ledger_no_truncate BEFORE TRUNCATE ON point_ledger_entries
                FOR EACH STATEMENT EXECUTE FUNCTION reject_point_ledger_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "point_ledger_entries");
            migrationBuilder.Sql("DROP FUNCTION reject_point_ledger_mutation();");

            migrationBuilder.DropTable(
                name: "point_wallets");
        }
    }
}
