import { z } from "zod"

const lineSchema = z
  .object({
    account_id: z.string().uuid(),
    description: z.string().max(500).optional().nullable(),
    debit_amount: z.number().min(0),
    credit_amount: z.number().min(0),
  })
  .refine((r) => (r.debit_amount > 0 && r.credit_amount === 0) || (r.credit_amount > 0 && r.debit_amount === 0), {
    message: "Each line must have either debit or credit (not both)",
  })

export const createManualVoucherSchema = z.object({
  voucher_date: z.string().min(1),
  narration: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(2),
})

export type CreateManualVoucherInput = z.infer<typeof createManualVoucherSchema>

export function assertBalancedLines(
  lines: { debit_amount: number; credit_amount: number }[]
): void {
  const dr = lines.reduce((s, l) => s + l.debit_amount, 0)
  const cr = lines.reduce((s, l) => s + l.credit_amount, 0)
  if (Number(dr.toFixed(2)) !== Number(cr.toFixed(2))) {
    throw new Error(`Voucher is not balanced: debits ${dr} vs credits ${cr}`)
  }
}
