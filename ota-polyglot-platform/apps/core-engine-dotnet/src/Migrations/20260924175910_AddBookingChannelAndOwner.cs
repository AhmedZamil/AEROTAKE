using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingChannelAndOwner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Pre-flight: the ownership constraint below cannot hold for a booking with no agent. Every booking made
            // before B2C existed went through the agent flow, so none should exist; if an environment has one, stop
            // here with a clear message instead of failing halfway through the migration.
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM ""Bookings"" WHERE ""AgentId"" IS NULL) THEN
                        RAISE EXCEPTION 'AddBookingChannelAndOwner: % booking(s) have no AgentId; decide their channel/owner before migrating (plan P2-1).',
                            (SELECT count(*) FROM ""Bookings"" WHERE ""AgentId"" IS NULL);
                    END IF;
                END $$;");

            // Existing bookings all came through the agent flow, so B2B_AGENT is the truth for them. The default exists
            // only to backfill; it is dropped straight after so a new code path must state its channel explicitly.
            migrationBuilder.AddColumn<string>(
                name: "Channel",
                table: "Bookings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "B2B_AGENT");

            migrationBuilder.Sql(@"ALTER TABLE ""Bookings"" ALTER COLUMN ""Channel"" DROP DEFAULT;");

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerId",
                table: "Bookings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GuestEmail",
                table: "Bookings",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_TenantId_AgentId",
                table: "Bookings",
                columns: new[] { "TenantId", "AgentId" });

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_TenantId_CustomerId",
                table: "Bookings",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Bookings_Channel",
                table: "Bookings",
                sql: "\"Channel\" IN ('B2B_AGENT','B2B_SUB_AGENT','WHITE_LABEL','B2C')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Bookings_Owner",
                table: "Bookings",
                sql: "(\"Channel\" <> 'B2C' AND \"AgentId\" IS NOT NULL AND \"CustomerId\" IS NULL) OR (\"Channel\" = 'B2C' AND \"AgentId\" IS NULL AND \"SubAgentId\" IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Bookings_TenantId_AgentId",
                table: "Bookings");

            migrationBuilder.DropIndex(
                name: "IX_Bookings_TenantId_CustomerId",
                table: "Bookings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Bookings_Channel",
                table: "Bookings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Bookings_Owner",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "Channel",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "GuestEmail",
                table: "Bookings");
        }
    }
}
