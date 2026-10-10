using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddAccountHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ParentId",
                schema: "accounting",
                table: "Accounts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_ParentId",
                schema: "accounting",
                table: "Accounts",
                column: "ParentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Accounts_Accounts_ParentId",
                schema: "accounting",
                table: "Accounts",
                column: "ParentId",
                principalSchema: "accounting",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Accounts_Accounts_ParentId",
                schema: "accounting",
                table: "Accounts");

            migrationBuilder.DropIndex(
                name: "IX_Accounts_ParentId",
                schema: "accounting",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "ParentId",
                schema: "accounting",
                table: "Accounts");
        }
    }
}
