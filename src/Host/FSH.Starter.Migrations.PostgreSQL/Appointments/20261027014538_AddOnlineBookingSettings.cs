using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Appointments
{
    /// <inheritdoc />
    public partial class AddOnlineBookingSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AppointmentSettings",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    OnlineBookingEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    BookingDaysAhead = table.Column<int>(type: "integer", nullable: false),
                    MaxBookingsPerPhonePerDay = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppointmentSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AppointmentSettings_Key",
                schema: "appointments",
                table: "AppointmentSettings",
                columns: new[] { "Key", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppointmentSettings",
                schema: "appointments");
        }
    }
}
