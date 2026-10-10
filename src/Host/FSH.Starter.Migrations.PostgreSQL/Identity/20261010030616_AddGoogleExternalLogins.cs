using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Identity
{
    /// <inheritdoc />
    public partial class AddGoogleExternalLogins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_UserLogins",
                schema: "identity",
                table: "UserLogins");

            migrationBuilder.AddPrimaryKey(
                name: "PK_UserLogins",
                schema: "identity",
                table: "UserLogins",
                columns: new[] { "LoginProvider", "ProviderKey", "TenantId" });

            migrationBuilder.CreateTable(
                name: "PendingTenantAdminProfiles",
                schema: "identity",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PhoneNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ExternalLoginProvider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ExternalProviderKey = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ExternalDisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PendingTenantAdminProfiles", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserLogins_LoginProvider_ProviderKey",
                schema: "identity",
                table: "UserLogins",
                columns: new[] { "LoginProvider", "ProviderKey" });

            migrationBuilder.CreateIndex(
                name: "IX_PendingTenantAdminProfiles_TenantId",
                schema: "identity",
                table: "PendingTenantAdminProfiles",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PendingTenantAdminProfiles",
                schema: "identity");

            migrationBuilder.DropPrimaryKey(
                name: "PK_UserLogins",
                schema: "identity",
                table: "UserLogins");

            migrationBuilder.DropIndex(
                name: "IX_UserLogins_LoginProvider_ProviderKey",
                schema: "identity",
                table: "UserLogins");

            migrationBuilder.AddPrimaryKey(
                name: "PK_UserLogins",
                schema: "identity",
                table: "UserLogins",
                columns: new[] { "LoginProvider", "ProviderKey" });
        }
    }
}
