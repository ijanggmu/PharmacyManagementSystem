using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Prescriptions
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_PrescriptionRefills_PrescriptionItems_PrescriptionItemId",
                schema: "prescriptions",
                table: "PrescriptionRefills",
                column: "PrescriptionItemId",
                principalSchema: "prescriptions",
                principalTable: "PrescriptionItems",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PrescriptionRefills_PrescriptionItems_PrescriptionItemId",
                schema: "prescriptions",
                table: "PrescriptionRefills");
        }
    }
}
