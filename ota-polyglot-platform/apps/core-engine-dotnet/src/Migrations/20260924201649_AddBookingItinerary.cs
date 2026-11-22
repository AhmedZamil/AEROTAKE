using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingItinerary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ItineraryJson",
                table: "Bookings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ItineraryJson",
                table: "Bookings");
        }
    }
}
