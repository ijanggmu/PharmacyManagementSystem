using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddIrdInvoiceQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InvoiceNumber",
                schema: "sales",
                table: "Sales",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IrdError",
                schema: "sales",
                table: "Sales",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IrdInvoiceId",
                schema: "sales",
                table: "Sales",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IrdStatus",
                schema: "sales",
                table: "Sales",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "IrdSyncedAtUtc",
                schema: "sales",
                table: "Sales",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "IrdInvoiceQueues",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    PayloadJson = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IrdInvoiceQueues", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SaleRefunds",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalSaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    RefundDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    RefundReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    RefundType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RefundMethod = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TaxRefundAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ProcessingFee = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    RefundNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreditNoteNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AccountingPostedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SaleRefunds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SaleReturns",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReturnDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ReturnReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StockRestoredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SaleReturns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SaleRefundItems",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleRefundId = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityRefunded = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SaleRefundItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SaleRefundItems_SaleRefunds_SaleRefundId",
                        column: x => x.SaleRefundId,
                        principalSchema: "sales",
                        principalTable: "SaleRefunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SaleReturnItems",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleReturnId = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityReturned = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UnitCostPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    PackagingCondition = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SaleReturnItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SaleReturnItems_SaleReturns_SaleReturnId",
                        column: x => x.SaleReturnId,
                        principalSchema: "sales",
                        principalTable: "SaleReturns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Sales_InvoiceNumber",
                schema: "sales",
                table: "Sales",
                columns: new[] { "InvoiceNumber", "TenantId" },
                unique: true,
                filter: "\"InvoiceNumber\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_IrdStatus",
                schema: "sales",
                table: "Sales",
                column: "IrdStatus");

            migrationBuilder.CreateIndex(
                name: "IX_IrdInvoiceQueues_SaleId",
                schema: "sales",
                table: "IrdInvoiceQueues",
                column: "SaleId");

            migrationBuilder.CreateIndex(
                name: "IX_IrdInvoiceQueues_Status",
                schema: "sales",
                table: "IrdInvoiceQueues",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_IrdInvoiceQueues_Status_NextAttemptAtUtc",
                schema: "sales",
                table: "IrdInvoiceQueues",
                columns: new[] { "Status", "NextAttemptAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefundItems_MedicineId",
                schema: "sales",
                table: "SaleRefundItems",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefundItems_SaleItemId",
                schema: "sales",
                table: "SaleRefundItems",
                column: "SaleItemId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefundItems_SaleRefundId",
                schema: "sales",
                table: "SaleRefundItems",
                column: "SaleRefundId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_CustomerId",
                schema: "sales",
                table: "SaleRefunds",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_OriginalSaleId",
                schema: "sales",
                table: "SaleRefunds",
                column: "OriginalSaleId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_RefundDateUtc",
                schema: "sales",
                table: "SaleRefunds",
                column: "RefundDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_RefundNumber",
                schema: "sales",
                table: "SaleRefunds",
                columns: new[] { "RefundNumber", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_Status",
                schema: "sales",
                table: "SaleRefunds",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturnItems_MedicineId",
                schema: "sales",
                table: "SaleReturnItems",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturnItems_SaleItemId",
                schema: "sales",
                table: "SaleReturnItems",
                column: "SaleItemId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturnItems_SaleReturnId",
                schema: "sales",
                table: "SaleReturnItems",
                column: "SaleReturnId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturns_CustomerId",
                schema: "sales",
                table: "SaleReturns",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturns_ReturnDateUtc",
                schema: "sales",
                table: "SaleReturns",
                column: "ReturnDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturns_SaleId",
                schema: "sales",
                table: "SaleReturns",
                column: "SaleId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturns_Status",
                schema: "sales",
                table: "SaleReturns",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IrdInvoiceQueues",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "SaleRefundItems",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "SaleReturnItems",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "SaleRefunds",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "SaleReturns",
                schema: "sales");

            migrationBuilder.DropIndex(
                name: "IX_Sales_InvoiceNumber",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropIndex(
                name: "IX_Sales_IrdStatus",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "InvoiceNumber",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "IrdError",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "IrdInvoiceId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "IrdStatus",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "IrdSyncedAtUtc",
                schema: "sales",
                table: "Sales");
        }
    }
}
