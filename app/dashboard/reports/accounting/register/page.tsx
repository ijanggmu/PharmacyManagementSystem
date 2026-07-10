"use client"

import VoucherRegisterTab from "../tabs/voucher-register-tab"
import { useAccountingContext } from "../accounting-context"

export default function VoucherRegisterPage() {
  const ctx = useAccountingContext()
  return <VoucherRegisterTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
}
