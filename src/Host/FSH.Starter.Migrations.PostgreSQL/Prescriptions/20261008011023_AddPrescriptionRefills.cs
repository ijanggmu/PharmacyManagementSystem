using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Prescriptions
{
    /// <inheritdoc />
    public partial class AddPrescriptionRefills : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PrescriptionRefills",
                schema: "prescriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityDispensed = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    RefilledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispensedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrescriptionRefills", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrescriptionRefills_Prescriptions_PrescriptionId",
                        column: x => x.PrescriptionId,
                        principalSchema: "prescriptions",
                        principalTable: "Prescriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionRefills_MedicineId",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionRefills_PrescriptionId",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                column: "PrescriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionRefills_PrescriptionItemId",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                column: "PrescriptionItemId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionRefills_RefilledAtUtc",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                column: "RefilledAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrescriptionRefills",
                schema: "prescriptions");
        }
    }
}
