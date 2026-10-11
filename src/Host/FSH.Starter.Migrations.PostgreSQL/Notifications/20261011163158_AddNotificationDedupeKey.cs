using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Notifications
{
    /// <inheritdoc />
    public partial class AddNotificationDedupeKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DedupeKey",
                schema: "notifications",
                table: "Notifications",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_Notifications_User_DedupeKey",
                schema: "notifications",
                table: "Notifications",
                columns: new[] { "UserId", "DedupeKey", "TenantId" },
                unique: true,
                filter: "\"DedupeKey\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_Notifications_User_DedupeKey",
                schema: "notifications",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "DedupeKey",
                schema: "notifications",
                table: "Notifications");
        }
    }
}
