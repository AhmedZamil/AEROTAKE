using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerPasswordLogin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_CustomerIdentities_Provider",
                schema: "identity_customers",
                table: "CustomerIdentities");

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                schema: "identity_customers",
                table: "CustomerIdentities",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CustomerEmailTokens",
                schema: "identity_customers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerEmailTokens", x => x.Id);
                    table.CheckConstraint("CK_CustomerEmailTokens_HashFormat", "\"TokenHash\" ~ '^[0-9a-f]{64}$'");
                    table.CheckConstraint("CK_CustomerEmailTokens_Purpose", "\"Purpose\" IN ('verify','reset')");
                    table.ForeignKey(
                        name: "FK_CustomerEmailTokens_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalSchema: "identity_customers",
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_CustomerIdentities_PasswordHash",
                schema: "identity_customers",
                table: "CustomerIdentities",
                sql: "(\"Provider\" = 'password') = (\"PasswordHash\" IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CustomerIdentities_Provider",
                schema: "identity_customers",
                table: "CustomerIdentities",
                sql: "\"Provider\" IN ('google','facebook','password')");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerEmailTokens_CustomerId",
                schema: "identity_customers",
                table: "CustomerEmailTokens",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerEmailTokens_TokenHash",
                schema: "identity_customers",
                table: "CustomerEmailTokens",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back removes the password logins (the old constraint would refuse them). The customers themselves, their bookings and any
            // Google/Facebook identities stay; a customer who only had a password can no longer sign in until they use the reset flow again.
            migrationBuilder.Sql("DELETE FROM identity_customers.\"CustomerIdentities\" WHERE \"Provider\" = 'password';");

            migrationBuilder.DropTable(
                name: "CustomerEmailTokens",
                schema: "identity_customers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CustomerIdentities_PasswordHash",
                schema: "identity_customers",
                table: "CustomerIdentities");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CustomerIdentities_Provider",
                schema: "identity_customers",
                table: "CustomerIdentities");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                schema: "identity_customers",
                table: "CustomerIdentities");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CustomerIdentities_Provider",
                schema: "identity_customers",
                table: "CustomerIdentities",
                sql: "\"Provider\" IN ('google','facebook')");
        }
    }
}
