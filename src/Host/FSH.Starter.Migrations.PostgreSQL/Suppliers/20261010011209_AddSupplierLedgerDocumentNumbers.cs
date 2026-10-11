using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class AddSupplierLedgerDocumentNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DocumentNumber",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SupplierBillNumber",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierLedgerEntries_SupplierId_ReferenceType_ReferenceId",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                columns: new[] { "SupplierId", "ReferenceType", "ReferenceId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SupplierLedgerEntries_SupplierId_ReferenceType_ReferenceId",
                schema: "suppliers",
                table: "SupplierLedgerEntries");

            migrationBuilder.DropColumn(
                name: "DocumentNumber",
                schema: "suppliers",
                table: "SupplierLedgerEntries");

            migrationBuilder.DropColumn(
                name: "SupplierBillNumber",
                schema: "suppliers",
                table: "SupplierLedgerEntries");
        }
    }
}
