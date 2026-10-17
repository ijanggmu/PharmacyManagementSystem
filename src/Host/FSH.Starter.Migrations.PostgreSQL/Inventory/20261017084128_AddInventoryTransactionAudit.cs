using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddInventoryTransactionAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedOnUtc",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<string>(
                name: "LastModifiedBy",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastModifiedOnUtc",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "timestamp with time zone",
                nullable: true);

            // Movements recorded before auditing keep their own timestamp; who made them stays unknown.
            migrationBuilder.Sql(
                "UPDATE inventory.\"InventoryTransactions\" SET \"CreatedOnUtc\" = \"CreatedAtUtc\" WHERE \"CreatedOnUtc\" = '-infinity' OR \"CreatedOnUtc\" = '0001-01-01T00:00:00Z';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedBy",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "CreatedOnUtc",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "LastModifiedBy",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "LastModifiedOnUtc",
                schema: "inventory",
                table: "InventoryTransactions");
        }
    }
}
