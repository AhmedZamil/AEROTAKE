using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboxEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OutboxEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Topic = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Key = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Payload = table.Column<string>(type: "text", nullable: false),
                    ProcessedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboxEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OutboxEvents_ProcessedAt",
                table: "OutboxEvents",
                column: "ProcessedAt",
                filter: "\"ProcessedAt\" IS NULL");

            // ai-engine-python reads this table directly via raw asyncpg SQL
            // (polling + LISTEN/NOTIFY) — it is NOT behind EF's query filter or
            // any API contract. Renaming/removing a column here silently
            // breaks that poller; update apps/ai-engine-python/app/outbox_poller.py
            // in the same change.
            migrationBuilder.Sql(
                "COMMENT ON TABLE \"OutboxEvents\" IS " +
                "'Read directly by ai-engine-python via raw SQL (polling + LISTEN/NOTIFY on the " +
                "outbox_events channel) — coordinate column changes with apps/ai-engine-python/app/outbox_poller.py.';");

            // NOTIFY payload is just a wakeup ping (topic name), not the row
            // itself — pg_notify caps payloads at 8000 bytes, and the poller's
            // own "WHERE ProcessedAt IS NULL" query is the authoritative read
            // regardless, so NOTIFY is a latency optimization, never the sole
            // delivery mechanism.
            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION notify_outbox_event() RETURNS trigger AS $$
                BEGIN
                    PERFORM pg_notify('outbox_events', NEW."Topic");
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                """);

            migrationBuilder.Sql(
                """
                CREATE TRIGGER outbox_event_notify
                AFTER INSERT ON "OutboxEvents"
                FOR EACH ROW EXECUTE FUNCTION notify_outbox_event();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS outbox_event_notify ON \"OutboxEvents\";");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS notify_outbox_event();");

            migrationBuilder.DropTable(
                name: "OutboxEvents");
        }
    }
}
