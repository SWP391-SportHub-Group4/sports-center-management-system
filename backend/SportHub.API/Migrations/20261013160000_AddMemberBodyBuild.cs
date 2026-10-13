using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations;

public partial class AddMemberBodyBuild : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.AddColumn<string>(name: "body_build", table: "member_training_profiles",
            type: "character varying(20)", maxLength: 20, nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropColumn(name: "body_build", table: "member_training_profiles");
}
