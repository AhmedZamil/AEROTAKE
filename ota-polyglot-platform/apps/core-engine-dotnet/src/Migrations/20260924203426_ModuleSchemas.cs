using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class ModuleSchemas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "identity_agents");

            migrationBuilder.EnsureSchema(
                name: "pricing");

            migrationBuilder.EnsureSchema(
                name: "booking");

            migrationBuilder.EnsureSchema(
                name: "identity_customers");

            migrationBuilder.EnsureSchema(
                name: "ledger");

            migrationBuilder.EnsureSchema(
                name: "messaging");

            migrationBuilder.EnsureSchema(
                name: "tenancy");

            migrationBuilder.RenameTable(
                name: "VerificationCodes",
                newName: "VerificationCodes",
                newSchema: "identity_agents");

            migrationBuilder.RenameTable(
                name: "Users",
                newName: "Users",
                newSchema: "identity_agents");

            migrationBuilder.RenameTable(
                name: "UserDevices",
                newName: "UserDevices",
                newSchema: "identity_agents");

            migrationBuilder.RenameTable(
                name: "Tenants",
                newName: "Tenants",
                newSchema: "tenancy");

            migrationBuilder.RenameTable(
                name: "TenantDomains",
                newName: "TenantDomains",
                newSchema: "tenancy");

            migrationBuilder.RenameTable(
                name: "RevokedTokens",
                newName: "RevokedTokens",
                newSchema: "identity_customers");

            migrationBuilder.RenameTable(
                name: "OutboxEvents",
                newName: "OutboxEvents",
                newSchema: "messaging");

            migrationBuilder.RenameTable(
                name: "MarkupRules",
                newName: "MarkupRules",
                newSchema: "pricing");

            migrationBuilder.RenameTable(
                name: "LedgerEntries",
                newName: "LedgerEntries",
                newSchema: "ledger");

            migrationBuilder.RenameTable(
                name: "GuestClaimTokens",
                newName: "GuestClaimTokens",
                newSchema: "identity_customers");

            migrationBuilder.RenameTable(
                name: "Customers",
                newName: "Customers",
                newSchema: "identity_customers");

            migrationBuilder.RenameTable(
                name: "CustomerIdentities",
                newName: "CustomerIdentities",
                newSchema: "identity_customers");

            migrationBuilder.RenameTable(
                name: "Bookings",
                newName: "Bookings",
                newSchema: "booking");

            migrationBuilder.RenameTable(
                name: "AgentTierProfiles",
                newName: "AgentTierProfiles",
                newSchema: "pricing");

            migrationBuilder.RenameTable(
                name: "Agents",
                newName: "Agents",
                newSchema: "identity_agents");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Written by hand: the generated Down calls RenameTable with only the OLD schema, which Npgsql treats as "no change"
            // — the rollback would report success and move nothing (checked on a scratch database).
            foreach (var (schema, table) in Moved)
                migrationBuilder.Sql($"ALTER TABLE IF EXISTS \"{schema}\".\"{table}\" SET SCHEMA public;");

            foreach (var schema in Moved.Select(m => m.Schema).Distinct())
                migrationBuilder.Sql($"DROP SCHEMA IF EXISTS \"{schema}\";"); // fails (rather than dropping data) if anything is left in it
        }

        private static readonly (string Schema, string Table)[] Moved =
        [
            ("identity_agents", "Agents"), ("identity_agents", "Users"), ("identity_agents", "UserDevices"), ("identity_agents", "VerificationCodes"),
            ("identity_customers", "Customers"), ("identity_customers", "CustomerIdentities"), ("identity_customers", "GuestClaimTokens"), ("identity_customers", "RevokedTokens"),
            ("pricing", "MarkupRules"), ("pricing", "AgentTierProfiles"),
            ("ledger", "LedgerEntries"), ("booking", "Bookings"), ("messaging", "OutboxEvents"),
            ("tenancy", "Tenants"), ("tenancy", "TenantDomains"),
        ];
    }
}
