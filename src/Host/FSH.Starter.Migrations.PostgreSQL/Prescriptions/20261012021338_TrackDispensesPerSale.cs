using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Prescriptions
{
    /// <inheritdoc />
    public partial class TrackDispensesPerSale : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PrescriptionDispenseEntries",
                schema: "prescriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    RefillDelta = table.Column<int>(type: "integer", nullable: false),
                    ReferenceType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ReferenceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrescriptionDispenseEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrescriptionDispenseEntries_PrescriptionItems_PrescriptionI~",
                        column: x => x.PrescriptionItemId,
                        principalSchema: "prescriptions",
                        principalTable: "PrescriptionItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionDispenseEntries_PrescriptionId",
                schema: "prescriptions",
                table: "PrescriptionDispenseEntries",
                column: "PrescriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionDispenseEntries_PrescriptionItemId",
                schema: "prescriptions",
                table: "PrescriptionDispenseEntries",
                column: "PrescriptionItemId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionDispenseEntries_SaleId_PrescriptionItemId_Refer~",
                schema: "prescriptions",
                table: "PrescriptionDispenseEntries",
                columns: new[] { "SaleId", "PrescriptionItemId", "ReferenceType", "ReferenceId", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrescriptionDispenseEntries",
                schema: "prescriptions");
        }
    }
}
