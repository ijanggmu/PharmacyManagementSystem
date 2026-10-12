using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class RestockCreditOriginalReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OriginalReferenceId",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OriginalReferenceType",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceBatchId",
                schema: "inventory",
                table: "InventoryTransactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_OriginalReferenceType_OriginalReferen~",
                schema: "inventory",
                table: "InventoryTransactions",
                columns: new[] { "OriginalReferenceType", "OriginalReferenceId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_OriginalReferenceType_OriginalReferen~",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "OriginalReferenceId",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "OriginalReferenceType",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "SourceBatchId",
                schema: "inventory",
                table: "InventoryTransactions");
        }
    }
}
