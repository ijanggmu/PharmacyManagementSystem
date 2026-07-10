#!/usr/bin/env node
/**
 * One-off: verify recent migrations and notify PostgREST to reload schema (Supabase).
 */
const fs = require("fs")
const path = require("path")
const { Client } = require("pg")

const root = path.resolve(__dirname, "..")
const envPath = path.join(root, ".env.local")
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
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
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().startsWith("postgres://")) return c.trim()
  }
  return candidates[0]
}

function stripSslMode(url) {
  try {
    const u = new URL(url)
    u.searchParams.delete("sslmode")
    u.searchParams.delete("uselibpqcompat")
    return u.toString()
  } catch {
    return url
  }
}

const connectionString = pickConnectionString()

async function main() {
  if (!connectionString || !String(connectionString).startsWith("postgres://")) {
    console.error("Missing valid postgres URL in .env.local")
    process.exit(1)
  }

  const client = new Client({
    connectionString: stripSslMode(connectionString),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  const res = await client.query(`
    SELECT migration_name, applied_at
    FROM schema_migrations
    WHERE migration_name >= '63-'
    ORDER BY migration_name
  `)
  console.log("Accounting migrations (63+):")
  for (const row of res.rows) {
    const d = row.applied_at
      ? new Date(row.applied_at).toISOString().slice(0, 10)
      : ""
    console.log(`  - ${row.migration_name} (${d})`)
  }

  try {
    await client.query("NOTIFY pgrst, 'reload schema'")
    console.log("\nPostgREST schema reload signal sent (NOTIFY pgrst).")
  } catch (err) {
    console.warn("\nNOTIFY pgrst failed (non-fatal):", err.message)
  }

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
