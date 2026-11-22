using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Ota.CoreEngine.Data;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    [DbContext(typeof(OtaDbContext))]
    [Migration("20261001143000_AddBookingLegs")]
    public partial class AddBookingLegs : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LegsJson",
                schema: "booking",
                table: "Bookings",
                type: "text",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LegsJson",
                schema: "booking",
                table: "Bookings");
        }
    }
}
