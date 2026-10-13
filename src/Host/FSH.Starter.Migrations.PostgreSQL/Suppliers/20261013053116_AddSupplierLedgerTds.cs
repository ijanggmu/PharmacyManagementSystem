using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class AddSupplierLedgerTds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "TdsAmount",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TdsAmount",
                schema: "suppliers",
                table: "SupplierLedgerEntries");
        }
    }
}
