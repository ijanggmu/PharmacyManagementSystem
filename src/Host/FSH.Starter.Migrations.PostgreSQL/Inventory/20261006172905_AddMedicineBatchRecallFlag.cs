using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddMedicineBatchRecallFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRecalled",
                schema: "inventory",
                table: "MedicineBatches",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RecallReason",
                schema: "inventory",
                table: "MedicineBatches",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RecalledAtUtc",
                schema: "inventory",
                table: "MedicineBatches",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsRecalled",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.DropColumn(
                name: "RecallReason",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.DropColumn(
                name: "RecalledAtUtc",
                schema: "inventory",
                table: "MedicineBatches");
        }
    }
}
