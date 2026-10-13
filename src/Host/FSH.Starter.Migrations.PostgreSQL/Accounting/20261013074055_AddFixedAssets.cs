using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddFixedAssets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DepreciationRuns",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
                    FromMonth = table.Column<int>(type: "integer", nullable: false),
                    ToMonth = table.Column<int>(type: "integer", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    AssetCount = table.Column<int>(type: "integer", nullable: false),
                    VoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    PostedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PostedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ReversedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReversedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ReversalVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DepreciationRuns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FixedAssetDepreciationEntries",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    RunId = table.Column<Guid>(type: "uuid", nullable: false),
                    Period = table.Column<int>(type: "integer", nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
                    FiscalMonth = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetDepreciationEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FixedAssets",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AssetTag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    AcquisitionDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PaymentMethod = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: true),
                    VendorName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    SupplierVatNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    BillNumber = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Cost = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    VatAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ResidualValue = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    UsefulLifeMonths = table.Column<int>(type: "integer", nullable: true),
                    RatePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    TaxPool = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    TaxUsefulLifeYears = table.Column<int>(type: "integer", nullable: true),
                    OpeningAccumulatedDepreciation = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    OpeningTaxWrittenDownValue = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    AcquisitionPeriod = table.Column<int>(type: "integer", nullable: false),
                    StartPeriod = table.Column<int>(type: "integer", nullable: false),
                    IsDisposed = table.Column<bool>(type: "boolean", nullable: false),
                    DisposedOnUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DisposalKind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    DisposalProceeds = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    DisposalPaymentMethod = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    DisposalAccumulatedDepreciation = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    DisposalGainLoss = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    DisposalNotes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssets", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DepreciationRuns_BranchId",
                schema: "accounting",
                table: "DepreciationRuns",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_DepreciationRuns_FiscalYear",
                schema: "accounting",
                table: "DepreciationRuns",
                column: "FiscalYear");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationEntries_FiscalYear_FiscalMonth",
                schema: "accounting",
                table: "FixedAssetDepreciationEntries",
                columns: new[] { "FiscalYear", "FiscalMonth" });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationEntries_RunId",
                schema: "accounting",
                table: "FixedAssetDepreciationEntries",
                column: "RunId");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationEntries_TenantId_AssetId_Period",
                schema: "accounting",
                table: "FixedAssetDepreciationEntries",
                columns: new[] { "TenantId", "AssetId", "Period" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_AcquisitionDateUtc",
                schema: "accounting",
                table: "FixedAssets",
                column: "AcquisitionDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_BranchId",
                schema: "accounting",
                table: "FixedAssets",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_SupplierId",
                schema: "accounting",
                table: "FixedAssets",
                column: "SupplierId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DepreciationRuns",
                schema: "accounting");

            migrationBuilder.DropTable(
                name: "FixedAssetDepreciationEntries",
                schema: "accounting");

            migrationBuilder.DropTable(
                name: "FixedAssets",
                schema: "accounting");
        }
    }
}
