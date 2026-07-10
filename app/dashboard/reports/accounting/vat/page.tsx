"use client"

import VatReturnTab from "../tabs/vat-return-tab"
import { useAccountingContext } from "../accounting-context"

export default function VatReturnPage() {
  const ctx = useAccountingContext()
  return <VatReturnTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
}
