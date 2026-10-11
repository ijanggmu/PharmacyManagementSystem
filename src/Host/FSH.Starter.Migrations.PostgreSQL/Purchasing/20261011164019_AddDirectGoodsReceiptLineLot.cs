using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Purchasing
{
    /// <inheritdoc />
    public partial class AddDirectGoodsReceiptLineLot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BatchId",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BatchNo",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BatchId",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");

            migrationBuilder.DropColumn(
                name: "BatchNo",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");
        }
    }
}
