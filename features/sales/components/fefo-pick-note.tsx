import { allocateFefo, formatBatchExpiry, type FefoPick } from "@/lib/inventory/fefo"

/** Tells the counter which physical lots to take for this quantity.
 *  Matches deduct_fefo_batches: soonest expiry first. */
export default function FefoPickNote({
  picks,
  quantity,
  batchTracked = false,
}: {
  picks: FefoPick[]
  quantity: number
  /** Medicine has batch rows, but none of them are still sellable. */
  batchTracked?: boolean
}) {
  const lines = allocateFefo(picks, quantity)
  const covered = lines.reduce((sum, line) => sum + line.take, 0)
  const uncovered = Math.max(0, quantity - covered)

  if (lines.length === 0) {
    return (
      <p className="text-[11px] leading-snug text-amber-700">
        {batchTracked ? "No sellable batch. Do not pick expired stock." : "No batch on file. Pick from shelf stock."}
      </p>
    )
  }

  return (
    <ul className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
      {lines.map((line) => (
        <li key={`${line.batch_number}-${line.expiry_date ?? "none"}`}>
          <span className="font-medium text-foreground">
            Pick {line.take} · {line.batch_number}
          </span>
          {" · "}
          {line.rack_location || "Rack not set"}
          {" · Exp "}
          {formatBatchExpiry(line.expiry_date) ?? "not set"}
        </li>
      ))}
      {uncovered > 0 ? (
        <li className="text-amber-700">
          {uncovered} more {uncovered === 1 ? "unit has" : "units have"} no batch. Take from untracked shelf stock.
        </li>
      ) : null}
    </ul>
  )
}
