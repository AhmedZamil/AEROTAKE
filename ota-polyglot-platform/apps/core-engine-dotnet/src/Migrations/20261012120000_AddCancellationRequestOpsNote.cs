using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Ota.CoreEngine.Data;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    [DbContext(typeof(OtaDbContext))]
    [Migration("20261012120000_AddCancellationRequestOpsNote")]
    public partial class AddCancellationRequestOpsNote : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OpsNote",
                schema: "booking",
                table: "CancellationRequests",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OpsNote",
                schema: "booking",
                table: "CancellationRequests");
        }
    }
}
