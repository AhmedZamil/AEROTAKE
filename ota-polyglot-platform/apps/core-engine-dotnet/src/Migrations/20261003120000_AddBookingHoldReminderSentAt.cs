using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Ota.CoreEngine.Data;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    [DbContext(typeof(OtaDbContext))]
    [Migration("20261003120000_AddBookingHoldReminderSentAt")]
    public partial class AddBookingHoldReminderSentAt : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "HoldReminderSentAt",
                schema: "booking",
                table: "Bookings",
                type: "timestamp with time zone",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HoldReminderSentAt",
                schema: "booking",
                table: "Bookings");
        }
    }
}
