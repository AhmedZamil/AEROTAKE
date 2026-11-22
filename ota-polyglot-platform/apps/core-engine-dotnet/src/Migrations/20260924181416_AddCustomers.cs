using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Pre-flight: Bookings.CustomerId gains a foreign key below. The column was added (unused) by the previous
            // migration, so it should be empty everywhere; if a database holds values, stop with a clear message
            // instead of a bare foreign-key error halfway through.
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM ""Bookings"" WHERE ""CustomerId"" IS NOT NULL) THEN
                        RAISE EXCEPTION 'AddCustomers: % booking(s) reference a CustomerId but no customers exist yet; clear or repair them before migrating.',
                            (SELECT count(*) FROM ""Bookings"" WHERE ""CustomerId"" IS NOT NULL);
                    END IF;
                END $$;");

            migrationBuilder.CreateTable(
                name: "Customers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    EmailVerified = table.Column<bool>(type: "boolean", nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Customers", x => x.Id);
                    table.CheckConstraint("CK_Customers_EmailLowercase", "\"Email\" IS NULL OR \"Email\" = lower(trim(\"Email\"))");
                });

            migrationBuilder.CreateTable(
                name: "GuestClaimTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BookingId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestClaimTokens", x => x.Id);
                    table.CheckConstraint("CK_GuestClaimTokens_HashFormat", "\"TokenHash\" ~ '^[0-9a-f]{64}$'");
                    table.ForeignKey(
                        name: "FK_GuestClaimTokens_Bookings_BookingId",
                        column: x => x.BookingId,
                        principalTable: "Bookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerIdentities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProviderSubject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    EmailVerified = table.Column<bool>(type: "boolean", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerIdentities", x => x.Id);
                    table.CheckConstraint("CK_CustomerIdentities_Provider", "\"Provider\" IN ('google','facebook')");
                    table.ForeignKey(
                        name: "FK_CustomerIdentities_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_CustomerId",
                table: "Bookings",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerIdentities_CustomerId",
                table: "CustomerIdentities",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerIdentities_TenantId_Provider_ProviderSubject",
                table: "CustomerIdentities",
                columns: new[] { "TenantId", "Provider", "ProviderSubject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_TenantId_Email",
                table: "Customers",
                columns: new[] { "TenantId", "Email" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuestClaimTokens_BookingId",
                table: "GuestClaimTokens",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_GuestClaimTokens_TokenHash",
                table: "GuestClaimTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Bookings_Customers_CustomerId",
                table: "Bookings",
                column: "CustomerId",
                principalTable: "Customers",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Dropping the customer tables would leave every booking that names a customer pointing at nothing — an
            // ownerless booking. Refuse instead of quietly losing who owns what; repair or remove those bookings first.
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM ""Bookings"" WHERE ""CustomerId"" IS NOT NULL) THEN
                        RAISE EXCEPTION 'Cannot revert AddCustomers: % booking(s) belong to a customer; reverting would orphan them.',
                            (SELECT count(*) FROM ""Bookings"" WHERE ""CustomerId"" IS NOT NULL);
                    END IF;
                END $$;");

            migrationBuilder.DropForeignKey(
                name: "FK_Bookings_Customers_CustomerId",
                table: "Bookings");

            migrationBuilder.DropTable(
                name: "CustomerIdentities");

            migrationBuilder.DropTable(
                name: "GuestClaimTokens");

            migrationBuilder.DropTable(
                name: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Bookings_CustomerId",
                table: "Bookings");
        }
    }
}
