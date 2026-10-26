using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Appointments
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "appointments");

            migrationBuilder.CreateTable(
                name: "Doctors",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NmcNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Speciality = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Phone = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Fee = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ShareType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ShareValue = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Doctors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DoctorDayChanges",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    MaxTokens = table.Column<int>(type: "integer", nullable: true),
                    Note = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorDayChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DoctorDayChanges_Doctors_DoctorId",
                        column: x => x.DoctorId,
                        principalSchema: "appointments",
                        principalTable: "Doctors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DoctorWeeklySlots",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    DayOfWeek = table.Column<int>(type: "integer", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    MaxTokens = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorWeeklySlots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DoctorWeeklySlots_Doctors_DoctorId",
                        column: x => x.DoctorId,
                        principalSchema: "appointments",
                        principalTable: "Doctors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorDayChanges_Date",
                schema: "appointments",
                table: "DoctorDayChanges",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorDayChanges_DoctorId_Date",
                schema: "appointments",
                table: "DoctorDayChanges",
                columns: new[] { "DoctorId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_Doctors_Name",
                schema: "appointments",
                table: "Doctors",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Doctors_NmcNumber",
                schema: "appointments",
                table: "Doctors",
                columns: new[] { "NmcNumber", "TenantId" },
                unique: true,
                filter: "\"NmcNumber\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorWeeklySlots_BranchId_DayOfWeek",
                schema: "appointments",
                table: "DoctorWeeklySlots",
                columns: new[] { "BranchId", "DayOfWeek" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorWeeklySlots_DoctorId",
                schema: "appointments",
                table: "DoctorWeeklySlots",
                column: "DoctorId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DoctorDayChanges",
                schema: "appointments");

            migrationBuilder.DropTable(
                name: "DoctorWeeklySlots",
                schema: "appointments");

            migrationBuilder.DropTable(
                name: "Doctors",
                schema: "appointments");
        }
    }
}
