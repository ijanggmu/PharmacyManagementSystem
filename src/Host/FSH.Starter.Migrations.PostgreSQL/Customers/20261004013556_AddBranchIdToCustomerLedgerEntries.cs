using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class AddBranchIdToCustomerLedgerEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "customers",
                table: "CustomerLedgerEntries",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_BranchId",
                schema: "customers",
                table: "CustomerLedgerEntries",
                column: "BranchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_BranchId",
                schema: "customers",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "customers",
                table: "CustomerLedgerEntries");
        }
    }
}
