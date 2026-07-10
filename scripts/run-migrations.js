#!/usr/bin/env node

/**
 * Simple migration runner for Supabase/Postgres.
 *
 * - Looks for numbered *.sql files in the scripts/ directory (e.g. 01-..., 02-..., 30-...).
 * - Applies any that are NOT yet recorded in schema_migrations.
 * - Wraps each migration in a transaction and records success.
 *
 * Environment:
 *   - SUPABASE_DB_URL or DATABASE_URL: Postgres connection string.
 *   - Loads project root `.env.local` when present (same pattern as scripts/seed-superadmin.js).
 */

const fs = require("fs")
const path = require("path")
const { Client } = require("pg")

const root = path.resolve(__dirname, "..")
const envPath = path.join(root, ".env.local")
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8")
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      const val = m[2].replace(/^["']|["']$/g, "").trim()
      process.env[m[1]] = val
    }
  })
}

function pickConnectionString() {
  const candidates = [
    process.env.SUPABASE_DB_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].filter(Boolean)

  // Prefer a full URL. Some setups accidentally set SUPABASE_DB_URL to host only.
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().startsWith("postgres://")) return c.trim()
  }
  return candidates[0]
}

const connectionString = pickConnectionString()

if (!connectionString) {
  console.error("Error: SUPABASE_DB_URL or DATABASE_URL must be set to run migrations.")
  console.error("Add one to .env.local (project root) or export it in your shell.")
  process.exit(1)
}

if (!String(connectionString).startsWith("postgres://")) {
  console.error("Error: No valid postgres connection string found.")
  console.error("Expected a value like postgres://... in one of: SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL_NON_POOLING, POSTGRES_URL, POSTGRES_PRISMA_URL")
  process.exit(1)
}

function stripSslMode(url) {
  try {
    const u = new URL(url)
    // We control TLS via `ssl` option below; sslmode parsing in pg can be stricter than desired.
    u.searchParams.delete("sslmode")
    u.searchParams.delete("uselibpqcompat")
    return u.toString()
  } catch {
    return url
  }
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
    const code = error && typeof error === "object" ? error.code : undefined
    const ignorableCodes = new Set([
      // duplicate_* errors common when running against an existing DB
      "42701", // duplicate_column
      "42P07", // duplicate_table / relation exists
      "42710", // duplicate_object (e.g. trigger exists)
      "42P16", // invalid_table_definition (often constraint exists)
    ])

    if (code && ignorableCodes.has(code)) {
      console.warn(`⚠ Migration already applied (detected by PG code ${code}), marking as applied: ${migrationName}`)
      await client.query(
        `
          INSERT INTO schema_migrations (migration_name, executed_by, notes)
          VALUES ($1, $2, $3)
          ON CONFLICT (migration_name) DO NOTHING;
        `,
        [migrationName, "auto-migrate", `Skipped (already exists): ${code}`]
      )
      return
    }

    console.error(`✖ Failed to apply migration ${migrationName}`)
    console.error(error)
    throw error
  }
}

async function main() {
  console.log("Running database migrations...")
  const client = new Client({
    connectionString: stripSslMode(connectionString),
    // Supabase poolers sometimes fail strict chain validation on Windows.
    // This keeps TLS but skips CA verification.
    ssl: { rejectUnauthorized: false },
  })
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

