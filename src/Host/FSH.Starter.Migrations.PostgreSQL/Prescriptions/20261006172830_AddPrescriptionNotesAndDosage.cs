using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Prescriptions
{
    /// <inheritdoc />
    public partial class AddPrescriptionNotesAndDosage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Notes",
                schema: "prescriptions",
                table: "Prescriptions",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DosageInstructions",
                schema: "prescriptions",
                table: "PrescriptionItems",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Notes",
                schema: "prescriptions",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "DosageInstructions",
                schema: "prescriptions",
                table: "PrescriptionItems");
        }
    }
}
