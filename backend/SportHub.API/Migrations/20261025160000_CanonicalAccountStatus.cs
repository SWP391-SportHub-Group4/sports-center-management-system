using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261025160000_CanonicalAccountStatus")]
public sealed class CanonicalAccountStatus : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Active=0 and Deactivated=2 retain their persisted values. The retired Banned=1
        // state remains unable to sign in; do not rewrite audit history or delete accounts.
        migrationBuilder.Sql("UPDATE user_accounts SET status = 2 WHERE status = 1;");
        migrationBuilder.AddCheckConstraint("ck_user_accounts_status", "user_accounts", "status IN (0, 2)");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint("ck_user_accounts_status", "user_accounts");
        // Both source states are deactivated now. A rollback must never reactivate accounts
        // or guess which ones previously carried the retired status.
    }
}
