using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.MultiTenancy
{
    /// <inheritdoc />
    public partial class AddBranchContactDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                schema: "tenant",
                table: "Branches",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                schema: "tenant",
                table: "Branches",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                schema: "tenant",
                table: "Branches",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Address",
                schema: "tenant",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "Email",
                schema: "tenant",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "Phone",
                schema: "tenant",
                table: "Branches");
        }
    }
}
