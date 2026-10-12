using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class SalesIdempotencyCreditNotesOpenShift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ClientRequestId",
                schema: "sales",
                table: "Sales",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreditNoteNumber",
                schema: "sales",
                table: "SaleReturns",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FiscalYear",
                schema: "sales",
                table: "SaleReturns",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_Sales_TenantId_ClientRequestId",
                schema: "sales",
                table: "Sales",
                columns: new[] { "TenantId", "ClientRequestId" },
                unique: true,
                filter: "\"ClientRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturns_TenantId_CreditNoteNumber",
                schema: "sales",
                table: "SaleReturns",
                columns: new[] { "TenantId", "CreditNoteNumber" },
                unique: true,
                filter: "\"CreditNoteNumber\" IS NOT NULL");

            // Before one-open-shift-per-branch is enforced: a branch that (through the old race) has several open
            // shifts keeps its most recently opened one; the older ones are closed with a note and NO counted
            // cash or frozen totals, so they stand out for review instead of blocking the migration.
            migrationBuilder.Sql("""
                UPDATE sales."CashShifts" AS s
                SET "Status" = 'Closed',
                    "ClosedAtUtc" = now(),
                    "ClosedBy" = 'system (duplicate open shift)',
                    "ClosingNotes" = 'Closed automatically: another shift was open at the same branch. Review the drawer.'
                WHERE s."Status" = 'Open'
                  AND EXISTS (
                      SELECT 1 FROM sales."CashShifts" AS newer
                      WHERE newer."TenantId" = s."TenantId"
                        AND newer."BranchId" = s."BranchId"
                        AND newer."Status" = 'Open'
                        AND (newer."OpenedAtUtc" > s."OpenedAtUtc"
                             OR (newer."OpenedAtUtc" = s."OpenedAtUtc" AND newer."Id" > s."Id")));
                """);

            migrationBuilder.CreateIndex(
                name: "UX_CashShifts_TenantId_BranchId_Open",
                schema: "sales",
                table: "CashShifts",
                columns: new[] { "TenantId", "BranchId" },
                unique: true,
                filter: "\"Status\" = 'Open'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_Sales_TenantId_ClientRequestId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropIndex(
                name: "IX_SaleReturns_TenantId_CreditNoteNumber",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropIndex(
                name: "UX_CashShifts_TenantId_BranchId_Open",
                schema: "sales",
                table: "CashShifts");

            migrationBuilder.DropColumn(
                name: "ClientRequestId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "CreditNoteNumber",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "FiscalYear",
                schema: "sales",
                table: "SaleReturns");
        }
    }
}
