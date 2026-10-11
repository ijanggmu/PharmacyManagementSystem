/**
 * True when the same medicine is on more than one line. The API rejects such a prescription: dispensing
 * matches a sale line to the prescription by medicine, so a second line could never be dispensed against.
 * Blank lines (no medicine picked yet) are ignored.
 */
export function hasDuplicateMedicines(items: ReadonlyArray<{ medicine_id: string }>): boolean {
  const ids = items.map((i) => i.medicine_id).filter((id) => id !== "")
  return new Set(ids).size !== ids.length
}

export const DUPLICATE_MEDICINE_MESSAGE =
  "Each medicine can appear only once on a prescription. Combine the quantities into one line."
