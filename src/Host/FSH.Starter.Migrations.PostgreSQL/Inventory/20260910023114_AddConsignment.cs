using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddConsignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsignmentPositions",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchNo = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    QuantityReceived = table.Column<decimal>(type: "numeric", nullable: false),
                    UnitCostPrice = table.Column<decimal>(type: "numeric", nullable: false),
                    SettledQuantity = table.Column<decimal>(type: "numeric", nullable: false),
                    ReceivedDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentPositions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSettlements",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    PositionsSettledCount = table.Column<int>(type: "integer", nullable: false),
                    SettlementDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SettledBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSettlements", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPositions_BatchId",
                schema: "inventory",
                table: "ConsignmentPositions",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPositions_SupplierId",
                schema: "inventory",
                table: "ConsignmentPositions",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_SettlementDateUtc",
                schema: "inventory",
                table: "ConsignmentSettlements",
                column: "SettlementDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_SupplierId",
                schema: "inventory",
                table: "ConsignmentSettlements",
                column: "SupplierId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConsignmentPositions",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ConsignmentSettlements",
                schema: "inventory");
        }
    }
}
