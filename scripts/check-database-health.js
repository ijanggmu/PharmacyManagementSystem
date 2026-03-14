#!/usr/bin/env node

/**
 * Database health check for Supabase.
 *
 * - Connects with SUPABASE_DB_URL or DATABASE_URL.
 * - Compares applied migrations (schema_migrations) vs scripts/*.sql.
 * - Verifies required tables and critical columns exist.
 *
 * Usage:
 *   Set SUPABASE_DB_URL (or DATABASE_URL), then:
 *   node scripts/check-database-health.js
 *
 * Get SUPABASE_DB_URL: Supabase Dashboard → Project Settings → Database → Connection string (URI).
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

const REQUIRED_TABLES = [
  "tenants", "users", "customers", "suppliers", "categories", "medicines",
  "prescriptions", "prescription_items", "sales", "sale_items", "inventory_transactions",
  "medicine_returns", "sales_refunds", "return_items", "audit_logs", "purchase_orders",
  "purchase_order_items", "warehouses", "system_settings", "schema_migrations",
  "branches", "plans", "tenant_subscriptions", "notifications",
];

const REQUIRED_COLUMNS = [
  ["sales", "tenant_id"],
  ["sales", "branch_id"],
  ["sales", "notes"],
  ["users", "tenant_id"],
  ["users", "current_branch_id"],
  ["inventory_transactions", "tenant_id"],
  ["inventory_transactions", "branch_id"],
  ["audit_logs", "tenant_id"],
];

const REQUIRED_FUNCTIONS = ["create_sale_with_items"];

function getMigrationFiles() {
  const scriptsDir = __dirname;
  const files = fs.readdirSync(scriptsDir);
  return files
    .filter((f) => /^\d{2}-.+\.sql$/.test(f))
    .sort()
    .map((f) => path.basename(f));
}

async function main() {
  if (!connectionString) {
    console.error("Set SUPABASE_DB_URL or DATABASE_URL to run the health check.");
    console.error("Get it from: Supabase Dashboard → Project Settings → Database → Connection string (URI).");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const report = { ok: true, missing: [], pendingMigrations: [], applied: [] };

  try {
    // Applied migrations
    let applied = [];
    try {
      const res = await client.query("SELECT migration_name FROM schema_migrations ORDER BY migration_name");
      applied = res.rows.map((r) => r.migration_name);
    } catch (e) {
      report.missing.push("schema_migrations table (run 00-create-migrations-table.sql or run-migrations.js once)");
      report.ok = false;
    }

    report.applied = applied;
    const migrationFiles = getMigrationFiles();
    const pending = migrationFiles.filter((f) => !applied.includes(f));
    if (pending.length) {
      report.pendingMigrations = pending;
      report.ok = false;
    }

    // Tables
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const existingTables = new Set(tablesRes.rows.map((r) => r.table_name));
    for (const t of REQUIRED_TABLES) {
      if (!existingTables.has(t)) report.missing.push(`table: ${t}`);
    }

    // Columns
    const colRes = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'`
    );
    const existingCols = new Set(colRes.rows.map((r) => `${r.table_name}.${r.column_name}`));
    for (const [t, c] of REQUIRED_COLUMNS) {
      if (!existingCols.has(`${t}.${c}`)) report.missing.push(`column: ${t}.${c}`);
    }

    // Functions
    const fnRes = await client.query(
      `SELECT p.proname FROM pg_proc p
       JOIN pg_namespace n ON p.pronamespace = n.oid AND n.nspname = 'public'
       WHERE p.proname = ANY($1)`,
      [REQUIRED_FUNCTIONS]
    );
    const existingFns = new Set(fnRes.rows.map((r) => r.proname));
    for (const f of REQUIRED_FUNCTIONS) {
      if (!existingFns.has(f)) report.missing.push(`function: ${f}`);
    }

    if (report.missing.length) report.ok = false;
  } finally {
    await client.end();
  }

  // Print report
  console.log("\n--- Database health check (Supabase) ---\n");

  if (report.pendingMigrations.length) {
    console.log("Pending migrations (run: node scripts/run-migrations.js):");
    report.pendingMigrations.forEach((m) => console.log("  -", m));
    console.log();
  }

  if (report.missing.length) {
    console.log("Missing in database:");
    report.missing.forEach((m) => console.log("  -", m));
    console.log();
  }

  if (report.ok && report.pendingMigrations.length === 0) {
    console.log("OK – Required tables, columns, and create_sale_with_items exist; no pending migrations.");
  } else {
    console.log("Fix the items above, then run migrations if needed: node scripts/run-migrations.js");
  }

  console.log("\nApplied migrations:", report.applied.length);
  process.exit(report.ok && report.pendingMigrations.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
