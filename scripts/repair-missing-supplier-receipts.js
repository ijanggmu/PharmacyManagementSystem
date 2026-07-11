#!/usr/bin/env node

/**
 * Repair medicines that have a supplier + stock but ended up with no goods
 * receipt / supplier ledger entry / accounting voucher — the bug fixed in
 * lib/server/services/medicine-service.ts and inventory-supplier-receipt-service.ts
 * (postDirectInventorySupplierReceipts occasionally resolved without throwing but
 * without creating a receipt either, most likely from a transient read-after-write
 * gap on the medicine re-select).
 *
 * For each affected medicine, this creates the missing goods_receipt +
 * goods_receipt_items + supplier_ledger_entries row, using the medicine's own
 * cost_price and current stock_quantity as the received quantity/cost — then the
 * existing DB trigger (trg_goods_receipts_accounting) auto-posts the purchase
 * voucher exactly as it would have at creation time.
 *
 * Usage:
 *   node scripts/repair-missing-supplier-receipts.js            # dry run (default)
 *   node scripts/repair-missing-supplier-receipts.js --apply     # actually writes
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

const APPLY = process.argv.includes("--apply")
const connectionString = pickConnectionString()

async function main() {
  const client = new Client({ connectionString: stripSslMode(connectionString), ssl: { rejectUnauthorized: false } })
  await client.connect()

  const { rows: affected } = await client.query(`
    SELECT m.id, m.tenant_id, m.name, m.supplier_id, m.cost_price, m.stock_quantity, mbs.branch_id, mbs.stock_quantity AS branch_stock
    FROM medicines m
    JOIN medicine_branch_stock mbs ON mbs.medicine_id = m.id AND mbs.stock_quantity > 0
    WHERE m.supplier_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM goods_receipt_items gri WHERE gri.medicine_id = m.id)
    ORDER BY m.created_at
  `)

  console.log(`Found ${affected.length} medicine(s) with a supplier + stock but no goods receipt.\n`)

  if (affected.length === 0) {
    await client.end()
    return
  }

  for (const row of affected) {
    const cost = Number(row.cost_price)
    const qty = Number(row.branch_stock)
    console.log(
      `  - ${row.name} (${row.id.slice(0, 8)}…) supplier ${row.supplier_id.slice(0, 8)}… ` +
        `qty ${qty} × cost ${cost} = ${(qty * cost).toFixed(2)}`
    )
  }

  if (!APPLY) {
    console.log("\nDry run only — no changes made. Re-run with --apply to create the missing receipts.")
    await client.end()
    return
  }

  console.log("\nApplying...\n")

  for (const row of affected) {
    const cost = Number(row.cost_price)
    const qty = Number(row.branch_stock)
    if (!(cost > 0) || !(qty > 0)) {
      console.log(`  Skipping ${row.name} — invalid cost/qty (${cost} × ${qty})`)
      continue
    }

    await client.query("BEGIN")
    try {
      const receiptNumber = `DGR-REPAIR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const totalCost = (cost * qty).toFixed(2)

      const grnResult = await client.query(
        `INSERT INTO goods_receipts (tenant_id, purchase_order_id, receipt_number, receipt_date, status, supplier_invoice_number, branch_id, created_by, supplier_id)
         VALUES ($1, NULL, $2, CURRENT_DATE, 'received', NULL, $3, NULL, $4)
         RETURNING id`,
        [row.tenant_id, receiptNumber, row.branch_id, row.supplier_id]
      )
      const grnId = grnResult.rows[0].id

      await client.query(
        `INSERT INTO goods_receipt_items (goods_receipt_id, medicine_id, quantity_received, unit_cost, total_cost, branch_id, vat_amount)
         VALUES ($1, $2, $3, $4, $5, $6, 0)`,
        [grnId, row.id, qty, cost.toFixed(2), totalCost, row.branch_id]
      )

      const { rows: lastEntry } = await client.query(
        `SELECT balance_after FROM supplier_ledger_entries WHERE supplier_id = $1 ORDER BY entry_date DESC, created_at DESC LIMIT 1`,
        [row.supplier_id]
      )
      const lastBalance = Number(lastEntry[0]?.balance_after ?? 0)
      const newBalance = (lastBalance + Number(totalCost)).toFixed(2)

      await client.query(
        `INSERT INTO supplier_ledger_entries (tenant_id, supplier_id, purchase_order_id, goods_receipt_id, reference_number, entry_type, amount, balance_after, entry_date)
         VALUES ($1, $2, NULL, $3, $4, 'invoice', $5, $6, CURRENT_DATE)`,
        [row.tenant_id, row.supplier_id, grnId, receiptNumber, totalCost, newBalance]
      )

      // trg_goods_receipts_accounting already fired on the insert above (status
      // was inserted as 'received' directly, matching what the trigger listens for).

      await client.query("COMMIT")
      console.log(`  Repaired ${row.name}: GRN ${receiptNumber}, ${totalCost} posted to supplier ledger.`)
    } catch (err) {
      await client.query("ROLLBACK")
      console.error(`  FAILED for ${row.name} (${row.id}): ${err.message}`)
    }
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
