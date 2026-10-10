using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddMedicineDetailFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Barcode",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CostPrice",
                schema: "inventory",
                table: "Medicines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Form",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Strength",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupplierId",
                schema: "inventory",
                table: "Medicines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                schema: "inventory",
                table: "Medicines",
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
                name: "Barcode",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "CostPrice",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "Form",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "Strength",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "SupplierId",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                schema: "inventory",
                table: "Medicines");
        }
    }
}
