#!/usr/bin/env node

/**
 * Simple migration runner for Supabase/Postgres.
 *
 * - Looks for numbered *.sql files in the scripts/ directory (e.g. 01-..., 02-..., 30-...).
 * - Applies any that are NOT yet recorded in schema_migrations.
 * - Wraps each migration in a transaction and records success.
 *
 * Environment:
 *   - Set SUPABASE_DB_URL or DATABASE_URL to your Postgres connection string.
 */

const fs = require("fs")
const path = require("path")
const { Client } = require("pg")

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!connectionString) {
  console.error("Error: SUPABASE_DB_URL or DATABASE_URL must be set to run migrations.")
  process.exit(1)
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      executed_by VARCHAR(255),
      checksum VARCHAR(64),
      notes TEXT
    );
  `)
}

async function getAppliedMigrations(client) {
  const res = await client.query("SELECT migration_name FROM schema_migrations")
  return new Set(res.rows.map((r) => r.migration_name))
}

function getMigrationFiles() {
  const scriptsDir = __dirname
  const files = fs.readdirSync(scriptsDir)
  return files
    .filter((f) => /^\d{2}-.+\.sql$/.test(f)) // only numbered migration scripts
    .sort()
    .map((f) => path.join(scriptsDir, f))
}

async function applyMigration(client, filePath) {
  const migrationName = path.basename(filePath)
  const sql = fs.readFileSync(filePath, "utf8")

  console.log(`\nApplying migration: ${migrationName}`)

  await client.query("BEGIN")
  try {
    await client.query(sql)
    await client.query(
      `
        INSERT INTO schema_migrations (migration_name, executed_by)
        VALUES ($1, $2)
        ON CONFLICT (migration_name) DO NOTHING;
      `,
      [migrationName, "auto-migrate"]
    )
    await client.query("COMMIT")
    console.log(`✔ Migration applied: ${migrationName}`)
  } catch (error) {
    await client.query("ROLLBACK")
    console.error(`✖ Failed to apply migration ${migrationName}`)
    console.error(error)
    throw error
  }
}

async function main() {
  console.log("Running database migrations...")
  const client = new Client({ connectionString })
  await client.connect()

  try {
    await ensureMigrationsTable(client)
    const applied = await getAppliedMigrations(client)
    const migrationFiles = getMigrationFiles()

    const pending = migrationFiles.filter((file) => !applied.has(path.basename(file)))

    if (pending.length === 0) {
      console.log("No pending migrations. Database is up to date.")
      await client.end()
      process.exit(0)
    }

    console.log(`Found ${pending.length} pending migration(s).`)

    for (const file of pending) {
      await applyMigration(client, file)
    }

    console.log("\nAll pending migrations applied successfully.")
  } catch (error) {
    console.error("\nMigration run failed.")
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()

