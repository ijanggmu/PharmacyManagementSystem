/**
 * Migration Verification Utility
 * Use this to check which migrations have been applied in your database
 */

import { createClient } from "@/lib/supabase/client"

export interface MigrationStatus {
  migration_name: string
  status: "APPLIED" | "MISSING"
  applied_at?: string
  executed_by?: string
}

export const EXPECTED_MIGRATIONS = [
  "01-create-pharmacy-tables.sql",
  "02-seed-initial-data.sql",
  "03-add-controlled-substance-column.sql",
  "04-create-medicine-returns-table.sql",
  "05-create-sales-refunds-table.sql",
  "06-create-returns-tables.sql",
  "07-add-timestamps.sql",
  "08-create-audit-logs.sql",
  "09-create-purchase-orders.sql",
  "10-create-warehouses.sql",
  "11-create-medicine-batches.sql",
  "12-create-serial-numbers.sql",
  "13-create-notifications-table.sql",
  "14-create-system-settings.sql",
  "15-add-is-taxable-column.sql",
  "16-add-customer-insurance-columns.sql",
]

export async function checkMigrations(): Promise<{
  migrations: MigrationStatus[]
  summary: {
    applied: number
    missing: number
    total: number
  }
}> {
  const supabase = createClient()

  // Ensure migrations table exists
  await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        executed_by VARCHAR(255),
        checksum VARCHAR(64),
        notes TEXT
      );
    `,
  })

  // Get applied migrations
  const { data: appliedMigrations, error } = await supabase
    .from("schema_migrations")
    .select("migration_name, applied_at, executed_by")

  if (error) {
    console.error("Error checking migrations:", error)
    return {
      migrations: EXPECTED_MIGRATIONS.map((name) => ({
        migration_name: name,
        status: "MISSING" as const,
      })),
      summary: {
        applied: 0,
        missing: EXPECTED_MIGRATIONS.length,
        total: EXPECTED_MIGRATIONS.length,
      },
    }
  }

  const appliedNames = new Set(
    (appliedMigrations || []).map((m: any) => m.migration_name)
  )

  const migrations: MigrationStatus[] = EXPECTED_MIGRATIONS.map((name) => {
    const applied = appliedMigrations?.find((m: any) => m.migration_name === name)
    return {
      migration_name: name,
      status: applied ? "APPLIED" : "MISSING",
      applied_at: applied?.applied_at,
      executed_by: applied?.executed_by,
    }
  })

  const applied = migrations.filter((m) => m.status === "APPLIED").length
  const missing = migrations.filter((m) => m.status === "MISSING").length

  return {
    migrations,
    summary: {
      applied,
      missing,
      total: EXPECTED_MIGRATIONS.length,
    },
  }
}

export async function verifySchema(): Promise<{
  tables: { name: string; exists: boolean }[]
  columns: { table: string; column: string; exists: boolean }[]
}> {
  const supabase = createClient()

  const expectedTables = [
    "users",
    "customers",
    "suppliers",
    "categories",
    "medicines",
    "prescriptions",
    "prescription_items",
    "sales",
    "sale_items",
    "inventory_transactions",
    "medicine_returns",
    "sales_refunds",
    "returns",
    "return_items",
    "audit_logs",
    "purchase_orders",
    "warehouses",
    "warehouse_stock",
    "stock_transfers",
    "medicine_batches",
    "serial_numbers",
    "notifications",
    "system_settings",
    "schema_migrations",
    "sale_payments",
  ]

  const expectedColumns = [
    { table: "medicines", column: "controlled_substance" },
    { table: "medicines", column: "is_taxable" },
    { table: "sale_items", column: "discount_percent" },
  ]

  // Check tables
  const { data: tables } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .in("table_name", expectedTables)

  const existingTables = new Set((tables || []).map((t: any) => t.table_name))

  const tableStatus = expectedTables.map((name) => ({
    name,
    exists: existingTables.has(name),
  }))

  // Check columns (this would need a custom query)
  // For now, return placeholder
  const columnStatus = expectedColumns.map(({ table, column }) => ({
    table,
    column,
    exists: false, // Would need custom query to check
  }))

  return {
    tables: tableStatus,
    columns: columnStatus,
  }
}

