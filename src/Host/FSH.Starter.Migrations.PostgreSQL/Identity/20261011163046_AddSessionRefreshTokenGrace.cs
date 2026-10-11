using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Identity
{
    /// <inheritdoc />
    public partial class AddSessionRefreshTokenGrace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PreviousRefreshTokenHash",
                schema: "identity",
                table: "UserSessions",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RefreshTokenRotatedAt",
                schema: "identity",
                table: "UserSessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserSessions_PreviousRefreshTokenHash",
                schema: "identity",
                table: "UserSessions",
                column: "PreviousRefreshTokenHash");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_UserSessions_PreviousRefreshTokenHash",
                schema: "identity",
                table: "UserSessions");

            migrationBuilder.DropColumn(
                name: "PreviousRefreshTokenHash",
                schema: "identity",
                table: "UserSessions");

            migrationBuilder.DropColumn(
                name: "RefreshTokenRotatedAt",
                schema: "identity",
                table: "UserSessions");
        }
    }
}
