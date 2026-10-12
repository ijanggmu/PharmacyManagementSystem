using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class ReverseLoyaltyOnCancelAndRefund : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RefundId",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLoyaltyEntries_RefundId",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                columns: new[] { "RefundId", "TenantId" },
                unique: true,
                filter: "\"RefundId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLoyaltyEntries_SaleId_Reversal_Unique",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                columns: new[] { "SaleId", "EntryType", "TenantId" },
                unique: true,
                filter: "\"SaleId\" IS NOT NULL AND \"RefundId\" IS NULL AND \"EntryType\" IN ('EarnReversed', 'RedeemReturned')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomerLoyaltyEntries_RefundId",
                schema: "customers",
                table: "CustomerLoyaltyEntries");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLoyaltyEntries_SaleId_Reversal_Unique",
                schema: "customers",
                table: "CustomerLoyaltyEntries");

            migrationBuilder.DropColumn(
                name: "RefundId",
                schema: "customers",
                table: "CustomerLoyaltyEntries");
        }
    }
}
