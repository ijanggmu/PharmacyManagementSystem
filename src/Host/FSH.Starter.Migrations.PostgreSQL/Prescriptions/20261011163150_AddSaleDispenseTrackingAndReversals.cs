using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Prescriptions
{
    /// <inheritdoc />
    public partial class AddSaleDispenseTrackingAndReversals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SaleId",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                schema: "prescriptions",
                table: "PrescriptionItems",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.CreateTable(
                name: "PrescriptionDispenseReversals",
                schema: "prescriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    FillRestored = table.Column<bool>(type: "boolean", nullable: false),
                    ReversedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrescriptionDispenseReversals", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "UX_PrescriptionRefills_Sale_Item",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                columns: new[] { "SaleId", "PrescriptionItemId", "TenantId" },
                unique: true,
                filter: "\"SaleId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionDispenseReversals_PrescriptionId",
                schema: "prescriptions",
                table: "PrescriptionDispenseReversals",
                column: "PrescriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionDispenseReversals_SaleId_PrescriptionItemId",
                schema: "prescriptions",
                table: "PrescriptionDispenseReversals",
                columns: new[] { "SaleId", "PrescriptionItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionDispenseReversals_SourceId_PrescriptionItemId",
                schema: "prescriptions",
                table: "PrescriptionDispenseReversals",
                columns: new[] { "SourceId", "PrescriptionItemId", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrescriptionDispenseReversals",
                schema: "prescriptions");

            migrationBuilder.DropIndex(
                name: "UX_PrescriptionRefills_Sale_Item",
                schema: "prescriptions",
                table: "PrescriptionRefills");

            migrationBuilder.DropColumn(
                name: "SaleId",
                schema: "prescriptions",
                table: "PrescriptionRefills");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "prescriptions",
                table: "PrescriptionItems");
        }
    }
}
