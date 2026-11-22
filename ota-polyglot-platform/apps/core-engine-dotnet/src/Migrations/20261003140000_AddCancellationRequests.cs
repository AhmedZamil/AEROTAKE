using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Ota.CoreEngine.Data;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    [DbContext(typeof(OtaDbContext))]
    [Migration("20261003140000_AddCancellationRequests")]
    public partial class AddCancellationRequests : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CancellationRequests",
                schema: "booking",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BookingId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CustomerNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RefundId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResolvedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CancellationRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CancellationRequests_Bookings_BookingId",
                        column: x => x.BookingId,
                        principalSchema: "booking",
                        principalTable: "Bookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CancellationRequests_Refunds_RefundId",
                        column: x => x.RefundId,
                        principalSchema: "payments",
                        principalTable: "Refunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CancellationRequests_BookingId",
                schema: "booking",
                table: "CancellationRequests",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_CancellationRequests_RefundId",
                schema: "booking",
                table: "CancellationRequests",
                column: "RefundId");

            migrationBuilder.CreateIndex(
                name: "IX_CancellationRequests_TenantId_BookingId_Status",
                schema: "booking",
                table: "CancellationRequests",
                columns: new[] { "TenantId", "BookingId", "Status" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CancellationRequests",
                schema: "booking");
        }
    }
}
