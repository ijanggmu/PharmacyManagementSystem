using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Appointments
{
    /// <inheritdoc />
    public partial class AddTokensFeesAndPayouts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DoctorPayouts",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    VisitCount = table.Column<int>(type: "integer", nullable: false),
                    PaymentMethod = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PaidAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PaidByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    PaidBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorPayouts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DoctorSessions",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    MaxTokens = table.Column<int>(type: "integer", nullable: false),
                    IsExtraDay = table.Column<bool>(type: "boolean", nullable: false),
                    IssuedTokens = table.Column<int>(type: "integer", nullable: false),
                    BookedCount = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Appointments",
                schema: "appointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    TokenNo = table.Column<int>(type: "integer", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PatientPhone = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    BookedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    BookedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ArrivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SeenAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelReason = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    FeeAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    DoctorShareAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    PaymentMethod = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    FeePaidAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FeeRefundedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PayoutId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrescriptionId = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Appointments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Appointments_DoctorSessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "appointments",
                        principalTable: "DoctorSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_BranchId_Date",
                schema: "appointments",
                table: "Appointments",
                columns: new[] { "BranchId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_DoctorId_PayoutId",
                schema: "appointments",
                table: "Appointments",
                columns: new[] { "DoctorId", "PayoutId" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_FeePaidAtUtc",
                schema: "appointments",
                table: "Appointments",
                column: "FeePaidAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_PatientPhone",
                schema: "appointments",
                table: "Appointments",
                column: "PatientPhone");

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_SessionId_TokenNo",
                schema: "appointments",
                table: "Appointments",
                columns: new[] { "SessionId", "TokenNo", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DoctorPayouts_BranchId_PaidAtUtc",
                schema: "appointments",
                table: "DoctorPayouts",
                columns: new[] { "BranchId", "PaidAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorPayouts_DoctorId_PaidAtUtc",
                schema: "appointments",
                table: "DoctorPayouts",
                columns: new[] { "DoctorId", "PaidAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorSessions_BranchId_Date",
                schema: "appointments",
                table: "DoctorSessions",
                columns: new[] { "BranchId", "Date" });

            migrationBuilder.CreateIndex(
                name: "UX_DoctorSessions_Doctor_Date_Start",
                schema: "appointments",
                table: "DoctorSessions",
                columns: new[] { "DoctorId", "Date", "StartTime", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Appointments",
                schema: "appointments");

            migrationBuilder.DropTable(
                name: "DoctorPayouts",
                schema: "appointments");

            migrationBuilder.DropTable(
                name: "DoctorSessions",
                schema: "appointments");
        }
    }
}
