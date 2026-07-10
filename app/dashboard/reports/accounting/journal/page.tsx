"use client"

import NewJournalTab from "../tabs/new-journal-tab"
import { useAccountingContext } from "../accounting-context"

export default function NewJournalPage() {
  const ctx = useAccountingContext()
  return <NewJournalTab accounts={ctx.accounts} />
}
