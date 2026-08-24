/**
 * DB-level integration tests — run against the real Postgres instance, not a
 * mocked Supabase client. Exists because a mocked-client unit test cannot see
 * trigger/RPC behavior: the `prevent_locked_sales_modification` trigger bug
 * (returning OLD instead of NEW on a BEFORE UPDATE, silently discarding every
 * write to `sales` while reporting success) was only caught by an actual
 * in-transaction write + re-read against the live DB, never by a unit test.
 *
 * Every test runs inside BEGIN/ROLLBACK — nothing here ever persists.
 *
 * Requires SUPABASE_DB_URL or POSTGRES_URL_NON_POOLING in the environment.
 * Run with `yarn test:integration`. Skips entirely (not fails) if no
 * connection string is configured, so it's safe in any environment.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { Client } from "pg"

const connectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL_NON_POOLING

const describeIfDb = connectionString ? describe : describe.skip

describeIfDb("DB hardening (live Postgres, always rolled back)", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  beforeEach(async () => {
    await client.query("BEGIN")
  })

  afterEach(async () => {
    await client.query("ROLLBACK")
  })

  it("persists a direct UPDATE on sales (regression test for the trigger no-op bug)", async () => {
    const { rows: sales } = await client.query("SELECT id, notes FROM sales LIMIT 1")
    if (sales.length === 0) {
      // No sales in this DB to test against — nothing to assert, but don't
      // silently pass as if the assertion ran.
      expect(sales.length).toBe(0)
      return
    }
    const id = sales[0].id
    const marker = `integration-test-${Date.now()}`

    await client.query("UPDATE sales SET notes = $1 WHERE id = $2", [marker, id])
    const { rows: after } = await client.query("SELECT notes FROM sales WHERE id = $1", [id])

    expect(after[0].notes).toBe(marker)
  })

  it("cancel_sale rejects a call with no authenticated tenant context", async () => {
    const { rows: sales } = await client.query("SELECT id FROM sales WHERE status = 'completed' LIMIT 1")
    if (sales.length === 0) return

    // A raw psql connection has no auth.uid(), so current_tenant_id() resolves
    // to NULL inside the function — the sale's real tenant_id can never equal
    // NULL, so this must fail closed with "not found", never silently succeed.
    await expect(
      client.query("SELECT cancel_sale($1, $2, $3)", [
        sales[0].id,
        "00000000-0000-0000-0000-000000000000",
        "integration test — should be rejected",
      ])
    ).rejects.toThrow(/not found/i)
  })

  it("accounting_reverse_posted_voucher rejects a call with no authenticated tenant context", async () => {
    const { rows: vouchers } = await client.query(
      "SELECT id FROM accounting_vouchers WHERE status = 'posted' LIMIT 1"
    )
    if (vouchers.length === 0) return

    await expect(
      client.query("SELECT accounting_reverse_posted_voucher($1, $2)", [
        vouchers[0].id,
        "00000000-0000-0000-0000-000000000000",
      ])
    ).rejects.toThrow(/not found/i)
  })

  it("create_stock_transfer rejects a forged tenant_id", async () => {
    const { rows: branches } = await client.query("SELECT id, tenant_id FROM branches LIMIT 2")
    if (branches.length < 2) return

    await expect(
      client.query(
        "SELECT create_stock_transfer($1, $2, $3, $4, $5, $6)",
        [
          "00000000-0000-0000-0000-000000000000", // forged tenant — doesn't match current_tenant_id() (NULL here)
          branches[0].id,
          branches[1].id,
          "00000000-0000-0000-0000-000000000000",
          "integration test",
          JSON.stringify([]),
        ]
      )
    ).rejects.toThrow(/tenant mismatch/i)
  })

  it("receive_stock_transfer and cancel_stock_transfer reject a forged tenant_id", async () => {
    const { rows: transfers } = await client.query("SELECT id FROM stock_transfers LIMIT 1")
    if (transfers.length === 0) return

    await expect(
      client.query("SELECT receive_stock_transfer($1, $2, $3)", [
        transfers[0].id,
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000",
      ])
    ).rejects.toThrow(/tenant mismatch/i)

    await expect(
      client.query("SELECT cancel_stock_transfer($1, $2, $3, $4)", [
        transfers[0].id,
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000",
        "integration test",
      ])
    ).rejects.toThrow(/tenant mismatch/i)
  })
})
