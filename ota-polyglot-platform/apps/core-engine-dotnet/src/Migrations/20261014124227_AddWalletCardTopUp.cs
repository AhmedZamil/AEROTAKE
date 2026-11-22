using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddWalletCardTopUp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WalletTopUps",
                schema: "payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Gateway = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TranId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    GatewayRef = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    GatewayPageUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PaidAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletTopUps", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WalletTopUps_TenantId_IdempotencyKey",
                schema: "payments",
                table: "WalletTopUps",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WalletTopUps_TranId",
                schema: "payments",
                table: "WalletTopUps",
                column: "TranId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WalletTopUps",
                schema: "payments");
        }
    }
}
