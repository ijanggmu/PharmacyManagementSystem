using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddTdsWithholding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "TdsAmount",
                schema: "accounting",
                table: "Expenses",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "TdsCategoryCode",
                schema: "accounting",
                table: "Expenses",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TdsCategoryName",
                schema: "accounting",
                table: "Expenses",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TdsRatePercent",
                schema: "accounting",
                table: "Expenses",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TdsCategories",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RatePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TdsCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TdsDeductions",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeductionDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VendorName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Pan = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CategoryCode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CategoryName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RatePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    TaxableAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TdsAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DocumentReference = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TdsDeductions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TdsCategories_TenantId_Code",
                schema: "accounting",
                table: "TdsCategories",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TdsDeductions_BranchId",
                schema: "accounting",
                table: "TdsDeductions",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_TdsDeductions_DeductionDateUtc",
                schema: "accounting",
                table: "TdsDeductions",
                column: "DeductionDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_TdsDeductions_TenantId_SourceType_SourceId",
                schema: "accounting",
                table: "TdsDeductions",
                columns: new[] { "TenantId", "SourceType", "SourceId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TdsCategories",
                schema: "accounting");

            migrationBuilder.DropTable(
                name: "TdsDeductions",
                schema: "accounting");

            migrationBuilder.DropColumn(
                name: "TdsAmount",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "TdsCategoryCode",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "TdsCategoryName",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "TdsRatePercent",
                schema: "accounting",
                table: "Expenses");
        }
    }
}
