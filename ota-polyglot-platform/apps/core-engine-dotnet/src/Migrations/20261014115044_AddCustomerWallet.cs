using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerWallet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_Gateway",
                schema: "payments",
                table: "Payments");

            migrationBuilder.CreateTable(
                name: "CustomerWallets",
                schema: "payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Balance = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerWallets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalletEntries",
                schema: "payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BalanceAfter = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    BookingId = table.Column<Guid>(type: "uuid", nullable: true),
                    Note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletEntries", x => x.Id);
                    table.CheckConstraint("CK_WalletEntries_Kind", "\"Kind\" IN ('credit','debit')");
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_Gateway",
                schema: "payments",
                table: "Payments",
                sql: "\"Gateway\" IN ('sslcommerz','wallet')");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerWallets_TenantId_CustomerId",
                schema: "payments",
                table: "CustomerWallets",
                columns: new[] { "TenantId", "CustomerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WalletEntries_TenantId_CustomerId_CreatedAt",
                schema: "payments",
                table: "WalletEntries",
                columns: new[] { "TenantId", "CustomerId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomerWallets",
                schema: "payments");

            migrationBuilder.DropTable(
                name: "WalletEntries",
                schema: "payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_Gateway",
                schema: "payments",
                table: "Payments");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_Gateway",
                schema: "payments",
                table: "Payments",
                sql: "\"Gateway\" IN ('sslcommerz')");
        }
    }
}
