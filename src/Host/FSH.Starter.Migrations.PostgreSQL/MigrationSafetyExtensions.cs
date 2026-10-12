using Microsoft.EntityFrameworkCore.Migrations;

namespace FSH.Starter.Migrations.PostgreSQL;

/// <summary>
/// Migration operations that add integrity constraints to tables which already hold production data,
/// without letting legacy bad rows block a deploy:
/// <list type="bullet">
/// <item><see cref="AddForeignKeyNotValid"/> adds the constraint <c>NOT VALID</c> (enforced for every new
/// or changed row from now on), then tries <c>VALIDATE CONSTRAINT</c> for the existing rows. If old orphans
/// exist, validation is skipped with a <c>WARNING</c> in the migrator log and the constraint stays
/// enforced-but-unvalidated until the orphans are cleaned up and it is validated by hand.</item>
/// <item><see cref="CreateUniqueIndexIfNoDuplicates"/> creates a unique index only when the existing rows
/// satisfy it, otherwise it logs a <c>WARNING</c> and skips it. The application-level checks still guard
/// new data in that case.</item>
/// </list>
/// Constraint and index names match EF's conventions, so the model snapshot and the generated
/// <c>Down</c> operations stay valid.
/// </summary>
public static class MigrationSafetyExtensions
{
    public static void AddForeignKeyNotValid(
        this MigrationBuilder migrationBuilder,
        string name,
        string table,
        string column,
        string principalTable,
        string? schema = null,
        string? principalSchema = null,
        string principalColumn = "Id",
        ReferentialAction onDelete = ReferentialAction.NoAction)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);

        string target = Qualified(schema, table);
        string principal = Qualified(principalSchema ?? schema, principalTable);
        string action = onDelete switch
        {
            ReferentialAction.Cascade => "CASCADE",
            ReferentialAction.Restrict => "RESTRICT",
            ReferentialAction.SetNull => "SET NULL",
            ReferentialAction.SetDefault => "SET DEFAULT",
            _ => "NO ACTION",
        };

        migrationBuilder.Sql($"""
            ALTER TABLE {target} ADD CONSTRAINT {Quote(name)}
                FOREIGN KEY ({Quote(column)}) REFERENCES {principal} ({Quote(principalColumn)})
                ON DELETE {action} NOT VALID;
            """);

        migrationBuilder.Sql($"""
            DO $$
            BEGIN
                ALTER TABLE {target} VALIDATE CONSTRAINT {Quote(name)};
            EXCEPTION WHEN foreign_key_violation THEN
                RAISE WARNING 'Foreign key {name} added but NOT validated: {target}.{Quote(column)} has rows with no matching {principal} row. New rows are checked. Clean up the orphans, then run: ALTER TABLE {target} VALIDATE CONSTRAINT {Quote(name)};';
            END $$;
            """);
    }

    public static void CreateUniqueIndexIfNoDuplicates(
        this MigrationBuilder migrationBuilder,
        string name,
        string table,
        string[] columns,
        string? schema = null,
        string? filter = null,
        bool unique = true)
    {
        ArgumentNullException.ThrowIfNull(columns);
        if (!unique)
        {
            throw new ArgumentException("Only unique indexes need the duplicate guard.", nameof(unique));
        }

        CreateUniqueIndexIfNoDuplicatesSql(migrationBuilder, name, table, columns.Select(Quote).ToArray(), schema, filter);
    }

    /// <summary>Same as <see cref="CreateUniqueIndexIfNoDuplicates"/>, with raw SQL key expressions
    /// (e.g. <c>upper(btrim("Name"))</c>) for indexes EF can't model.</summary>
    public static void CreateUniqueIndexIfNoDuplicatesSql(
        this MigrationBuilder migrationBuilder,
        string name,
        string table,
        string[] keyExpressions,
        string? schema = null,
        string? filter = null)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        ArgumentNullException.ThrowIfNull(keyExpressions);

        string target = Qualified(schema, table);
        string keys = string.Join(", ", keyExpressions);
        string where = string.IsNullOrWhiteSpace(filter) ? string.Empty : $" WHERE {filter}";

        migrationBuilder.Sql($"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM {target}{where} GROUP BY {keys} HAVING count(*) > 1) THEN
                    RAISE WARNING 'Unique index {name} NOT created: {target} already has duplicate ({keys}) rows. Merge the duplicates, then re-run this migration''s index statement.';
                ELSE
                    CREATE UNIQUE INDEX IF NOT EXISTS {Quote(name)} ON {target} ({keys}){where};
                END IF;
            END $$;
            """);
    }

    private static string Qualified(string? schema, string table) =>
        schema is null ? Quote(table) : $"{Quote(schema)}.{Quote(table)}";

    private static string Quote(string identifier) => $"\"{identifier.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
}
