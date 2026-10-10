"use client"

import { useEffect } from "react"
import { Info } from "lucide-react"
import GeneralLedgerTab from "../tabs/general-ledger-tab"
import VoucherRegisterTab from "../tabs/voucher-register-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"
import { useNewJournalDialog } from "../new-journal-dialog"

/** Vouchers & ledger: register (default) | ledger | journal. */
export default function VouchersAndLedgerPage() {
  const ctx = useAccountingContext()
  const { open, canWrite } = useNewJournalDialog()

  // `?new=1` opens the New journal dialog once, then drops the param.
  useEffect(() => {
    if (!canWrite) return
    const url = new URL(window.location.href)
    if (url.searchParams.get("new") !== "1") return
    open()
    url.searchParams.delete("new")
    window.history.replaceState(null, "", url.pathname + url.search)
  }, [canWrite, open])

  return (
    <>
      <AccountingTabPanel view="register">
        <VoucherRegisterTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} accounts={ctx.accounts} />
      </AccountingTabPanel>

      <AccountingTabPanel view="ledger">
        <GeneralLedgerTab
          dateRange={ctx.dateRange}
          branchFilterId={ctx.branchFilterId}
          accounts={ctx.accounts}
          accountsLoading={ctx.accountsLoading}
          glAccountId={ctx.glAccountId}
          setGlAccountId={ctx.setGlAccountId}
          glRows={ctx.glRows}
          setGlRows={ctx.setGlRows}
          glOpening={ctx.glOpening}
          setGlOpening={ctx.setGlOpening}
          glClosing={ctx.glClosing}
          setGlClosing={ctx.setGlClosing}
          glPage={ctx.glPage}
          setGlPage={ctx.setGlPage}
          glTotalCount={ctx.glTotalCount}
          setGlTotalCount={ctx.setGlTotalCount}
          glTotalPages={ctx.glTotalPages}
          setGlTotalPages={ctx.setGlTotalPages}
          glLoading={ctx.glLoading}
          setGlLoading={ctx.setGlLoading}
        />
      </AccountingTabPanel>

      <AccountingTabPanel view="journal">
        <div className="space-y-4">
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
            <span>
              Manual journals (MJE) in the period. {canWrite ? "Use New journal to record an adjustment the system can't post automatically. " : ""}
              Drafts can be edited or deleted; posted journals can only be reversed or voided.
            </span>
          </p>
          <VoucherRegisterTab
            dateRange={ctx.dateRange}
            branchFilterId={ctx.branchFilterId}
            accounts={ctx.accounts}
            initialSource="manual"
          />
        </div>
      </AccountingTabPanel>
    </>
  )
}
