using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_CustomerLoyaltyEntries_BranchId",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                column: "BranchId");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_CustomerLedgerEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLedgerEntries",
                column: "CustomerId",
                principalSchema: "customers",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_CustomerLoyaltyEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                column: "CustomerId",
                principalSchema: "customers",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLoyaltyEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLoyaltyEntries");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLoyaltyEntries_BranchId",
                schema: "customers",
                table: "CustomerLoyaltyEntries");
        }
    }
}
