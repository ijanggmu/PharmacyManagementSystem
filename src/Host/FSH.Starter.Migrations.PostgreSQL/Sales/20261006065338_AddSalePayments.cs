using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddSalePayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BalanceDue",
                schema: "sales",
                table: "Sales",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                schema: "sales",
                table: "SaleItems",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "SalePayments",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalePayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalePayments_Sales_SaleId",
                        column: x => x.SaleId,
                        principalSchema: "sales",
                        principalTable: "Sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SalePayments_BranchId",
                schema: "sales",
                table: "SalePayments",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SalePayments_SaleId",
                schema: "sales",
                table: "SalePayments",
                column: "SaleId");

            // Backfill (data only, no schema loss): existing sales were single-tender, so each gets one
            // payment line from its legacy PaymentMethod/PaymentAmount, and its BalanceDue is whatever
            // the stored payment left uncovered.
            migrationBuilder.Sql("""
                UPDATE sales."Sales" s
                SET "BalanceDue" = GREATEST(
                    COALESCE((
                        SELECT SUM(i."Quantity" * i."UnitPrice" - i."DiscountAmount")
                        FROM sales."SaleItems" i
                        WHERE i."SaleId" = s."Id"), 0) - s."PaymentAmount", 0);
                """);

            migrationBuilder.Sql("""
                INSERT INTO sales."SalePayments" ("Id", "SaleId", "BranchId", "Method", "Amount", "Reference", "TenantId")
                SELECT gen_random_uuid(), s."Id", s."BranchId", s."PaymentMethod", s."PaymentAmount", NULL, s."TenantId"
                FROM sales."Sales" s
                WHERE s."PaymentAmount" > 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SalePayments",
                schema: "sales");

            migrationBuilder.DropColumn(
                name: "BalanceDue",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                schema: "sales",
                table: "SaleItems");
        }
    }
}
