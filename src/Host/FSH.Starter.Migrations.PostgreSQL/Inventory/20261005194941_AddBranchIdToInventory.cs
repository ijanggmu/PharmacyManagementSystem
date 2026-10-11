using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddBranchIdToInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "inventory",
                table: "MedicineBatches",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AlterColumn<Guid>(
                name: "MedicineBatchId",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "inventory",
                table: "ConsignmentSettlements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "inventory",
                table: "ConsignmentPositions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MedicineLocationStocks",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicineLocationStocks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MedicinePriceHistories",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    CostPrice = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveTo = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicinePriceHistories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "NepalMedicineCatalogEntries",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BrandName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    GenericName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Form = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Strength = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Manufacturer = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    CategoryName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Dosage = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    CostPrice = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    SideEffects = table.Column<string>(type: "text", nullable: true),
                    StorageInstructions = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    PrescriptionRequired = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NepalMedicineCatalogEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StockTransfers",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TransferNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FromLocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToLocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromBranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToBranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReceivedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CancelledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CancellationReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockTransfers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StockTransferItems",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StockTransferId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockTransferItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockTransferItems_StockTransfers_StockTransferId",
                        column: x => x.StockTransferId,
                        principalSchema: "inventory",
                        principalTable: "StockTransfers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicineBatches_BranchId",
                schema: "inventory",
                table: "MedicineBatches",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_BranchId",
                schema: "inventory",
                table: "InventoryTransactions",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_BranchId",
                schema: "inventory",
                table: "ConsignmentSettlements",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPositions_BranchId",
                schema: "inventory",
                table: "ConsignmentPositions",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicineLocationStocks_MedicineId_LocationId",
                schema: "inventory",
                table: "MedicineLocationStocks",
                columns: new[] { "MedicineId", "LocationId", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicinePriceHistories_MedicineId_EffectiveFrom",
                schema: "inventory",
                table: "MedicinePriceHistories",
                columns: new[] { "MedicineId", "EffectiveFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicinePriceHistories_MedicineId_OneScheduled",
                schema: "inventory",
                table: "MedicinePriceHistories",
                columns: new[] { "MedicineId", "TenantId" },
                unique: true,
                filter: "\"Status\" = 0");

            migrationBuilder.CreateIndex(
                name: "IX_NepalMedicineCatalogEntries_BrandName",
                schema: "inventory",
                table: "NepalMedicineCatalogEntries",
                column: "BrandName");

            migrationBuilder.CreateIndex(
                name: "IX_NepalMedicineCatalogEntries_GenericName",
                schema: "inventory",
                table: "NepalMedicineCatalogEntries",
                column: "GenericName");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransferItems_MedicineId",
                schema: "inventory",
                table: "StockTransferItems",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransferItems_StockTransferId",
                schema: "inventory",
                table: "StockTransferItems",
                column: "StockTransferId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_FromBranchId_ToBranchId",
                schema: "inventory",
                table: "StockTransfers",
                columns: new[] { "FromBranchId", "ToBranchId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_FromLocationId_ToLocationId",
                schema: "inventory",
                table: "StockTransfers",
                columns: new[] { "FromLocationId", "ToLocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_Status",
                schema: "inventory",
                table: "StockTransfers",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_TransferNumber",
                schema: "inventory",
                table: "StockTransfers",
                columns: new[] { "TransferNumber", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicineLocationStocks",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "MedicinePriceHistories",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "NepalMedicineCatalogEntries",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "StockTransferItems",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "StockTransfers",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "IX_MedicineBatches_BranchId",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_BranchId",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentSettlements_BranchId",
                schema: "inventory",
                table: "ConsignmentSettlements");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentPositions_BranchId",
                schema: "inventory",
                table: "ConsignmentPositions");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "inventory",
                table: "ConsignmentSettlements");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "inventory",
                table: "ConsignmentPositions");

            migrationBuilder.AlterColumn<Guid>(
                name: "MedicineBatchId",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
