using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class AddSupplierPaymentNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PaymentNumber",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaymentNumber",
                schema: "suppliers",
                table: "SupplierLedgerEntries");
        }
    }
}
