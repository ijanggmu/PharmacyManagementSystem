using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class AddCustomerPaymentTerms : Migration
    {
        /// <inheritdoc />
        /// <remarks>No backfill: existing ledger rows keep a NULL due date and are read with the party's CURRENT
        /// credit days (PaymentTerms.EffectiveDueDate). Every supplier/customer starts without terms, so writing
        /// "bill date + default" now would write nothing, while the read-time fallback applies terms to older open
        /// bills as soon as they are set. Without terms an item stays undated and is aged by date only.</remarks>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CreditDays",
                schema: "customers",
                table: "Customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DueDateUtc",
                schema: "customers",
                table: "CustomerLedgerEntries",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreditDays",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "DueDateUtc",
                schema: "customers",
                table: "CustomerLedgerEntries");
        }
    }
}
