using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ota.CoreEngine.Migrations
{
    /// <inheritdoc />
    public partial class AddMarkupRuleChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MarkupRules_TenantId_Tier_ProductType",
                table: "MarkupRules");

            migrationBuilder.AlterColumn<int>(
                name: "Tier",
                table: "MarkupRules",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            // Every existing rule is an agent (tier) rule. The default exists only to backfill and is dropped straight
            // after, so a new rule must state its scheme.
            migrationBuilder.AddColumn<string>(
                name: "Channel",
                table: "MarkupRules",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "B2B_AGENT");

            migrationBuilder.Sql(@"ALTER TABLE ""MarkupRules"" ALTER COLUMN ""Channel"" DROP DEFAULT;");

            // Give every tenant consumer pricing identical to what logged-out visitors already pay today. Until now an
            // anonymous caller was priced at the Standard tier, so copying the Standard rule (Tier = 1) changes no price;
            // it just lets an admin change consumer pricing independently of agent pricing from here on.
            migrationBuilder.Sql(@"
                INSERT INTO ""MarkupRules"" (""Id"", ""TenantId"", ""CreatedAt"", ""Channel"", ""Tier"", ""ProductType"",
                                            ""MarkupPercent"", ""SubAgentDefaultMargin"", ""IsActive"")
                SELECT gen_random_uuid(), ""TenantId"", now(), 'B2C', NULL, ""ProductType"",
                       ""MarkupPercent"", ""SubAgentDefaultMargin"", ""IsActive""
                FROM ""MarkupRules""
                WHERE ""Channel"" = 'B2B_AGENT' AND ""Tier"" = 1;");

            migrationBuilder.CreateIndex(
                name: "IX_MarkupRules_TenantId_Channel_Tier_ProductType",
                table: "MarkupRules",
                columns: new[] { "TenantId", "Channel", "Tier", "ProductType" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.AddCheckConstraint(
                name: "CK_MarkupRules_ChannelTier",
                table: "MarkupRules",
                sql: "(\"Channel\" = 'B2C' AND \"Tier\" IS NULL) OR (\"Channel\" = 'B2B_AGENT' AND \"Tier\" IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Consumer rules have no tier and cannot exist in the old schema; they are new data and are dropped.
            migrationBuilder.Sql(@"DELETE FROM ""MarkupRules"" WHERE ""Channel"" = 'B2C';");

            migrationBuilder.DropIndex(
                name: "IX_MarkupRules_TenantId_Channel_Tier_ProductType",
                table: "MarkupRules");

            migrationBuilder.DropCheckConstraint(
                name: "CK_MarkupRules_ChannelTier",
                table: "MarkupRules");

            migrationBuilder.DropColumn(
                name: "Channel",
                table: "MarkupRules");

            migrationBuilder.AlterColumn<int>(
                name: "Tier",
                table: "MarkupRules",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MarkupRules_TenantId_Tier_ProductType",
                table: "MarkupRules",
                columns: new[] { "TenantId", "Tier", "ProductType" },
                unique: true);
        }
    }
}
