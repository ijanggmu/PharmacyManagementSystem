"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { apiGet } from "@/lib/api/client-helpers"
import { formatLocalDateYmd } from "@/lib/utils/date"

export interface DateRange {
  from: Date
  to: Date
}

export interface GlRow {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  line_no: number
  description: string | null
  debit_amount: number
  credit_amount: number
  running_balance: number
}

function toYmd(d: Date) {
  return formatLocalDateYmd(d)
}

interface AccountingContextValue {
  dateRange: DateRange | undefined
  setDateRange: (d: DateRange | undefined) => void
  rangeStr: { from: string; to: string }
  branches: { id: string; name: string; code: string }[]
  branchFilterId: string
  setBranchFilterId: (id: string) => void
  accounts: AccountingAccount[]
  setAccounts: React.Dispatch<React.SetStateAction<AccountingAccount[]>>
  accountsLoading: boolean
  lockDate: string | null
  setLockDate: React.Dispatch<React.SetStateAction<string | null>>
  lockDraft: string
  setLockDraft: React.Dispatch<React.SetStateAction<string>>
  lockSaving: boolean
  setLockSaving: React.Dispatch<React.SetStateAction<boolean>>
  glAccountId: string
  setGlAccountId: React.Dispatch<React.SetStateAction<string>>
  glRows: GlRow[]
  setGlRows: React.Dispatch<React.SetStateAction<GlRow[]>>
  glOpening: number
  setGlOpening: React.Dispatch<React.SetStateAction<number>>
  glLoading: boolean
  setGlLoading: React.Dispatch<React.SetStateAction<boolean>>
  /** Loads the ledger for a given account code into the shared GL state — call this,
   *  then router.push to the ledger page, to reproduce "click account -> jump to GL". */
  loadLedgerForAccountCode: (accountCode: string) => Promise<void>
}

const AccountingContext = createContext<AccountingContextValue | null>(null)

export function AccountingProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })

  const [accounts, setAccounts] = useState<AccountingAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  const [branches, setBranches] = useState<{ id: string; name: string; code: string }[]>([])
  const [branchFilterId, setBranchFilterId] = useState<string>("")

  const [lockDate, setLockDate] = useState<string | null>(null)
  const [lockDraft, setLockDraft] = useState("")
  const [lockSaving, setLockSaving] = useState(false)

  const [glAccountId, setGlAccountId] = useState<string>("")
  const [glRows, setGlRows] = useState<GlRow[]>([])
  const [glOpening, setGlOpening] = useState(0)
  const [glLoading, setGlLoading] = useState(false)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ctx = await apiGet<{ branches: { id: string; name: string; code: string }[]; currentBranchId: string | null }>(
          "/api/branch-context"
        )
        if (cancelled) return
        setBranches(ctx?.branches ?? [])
        if (ctx?.currentBranchId && !branchFilterId) {
          setBranchFilterId(ctx.currentBranchId)
        }
      } catch {
        /* branch filter optional */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await accountingApi.getAccounts()
        if (!cancelled) setAccounts(data || [])
      } catch {
        if (!cancelled) {
          toast({ title: "Unable to load accounts", variant: "destructive" })
        }
      } finally {
        if (!cancelled) setAccountsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await accountingApi.getPostingLock()
        if (!cancelled) {
          setLockDate(r.lock_date)
          setLockDraft(r.lock_date ?? "")
        }
      } catch {
        /* non-fatal */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadLedgerForAccountCode = useCallback(
    async (accountCode: string) => {
      const account = accounts.find((a) => a.code === accountCode)
      if (!account) {
        toast({ title: "Account not found", variant: "destructive" })
        return
      }
      setGlAccountId(account.id)
      if (!dateRange) return
      setGlLoading(true)
      try {
        const res = await accountingApi.generalLedger(account.id, rangeStr.from, rangeStr.to)
        setGlOpening(Number(res.opening_balance ?? 0))
        setGlRows((res.rows || []) as GlRow[])
      } catch (e) {
        toast({
          title: "General ledger failed",
          description: e instanceof Error ? e.message : "Error",
          variant: "destructive",
        })
      } finally {
        setGlLoading(false)
      }
    },
    [accounts, dateRange, rangeStr.from, rangeStr.to, toast]
  )

  const value: AccountingContextValue = {
    dateRange,
    setDateRange,
    rangeStr,
    branches,
    branchFilterId,
    setBranchFilterId,
    accounts,
    setAccounts,
    accountsLoading,
    lockDate,
    setLockDate,
    lockDraft,
    setLockDraft,
    lockSaving,
    setLockSaving,
    glAccountId,
    setGlAccountId,
    glRows,
    setGlRows,
    glOpening,
    setGlOpening,
    glLoading,
    setGlLoading,
    loadLedgerForAccountCode,
  }

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>
}

export function useAccountingContext(): AccountingContextValue {
  const ctx = useContext(AccountingContext)
  if (!ctx) throw new Error("useAccountingContext must be used within AccountingProvider")
  return ctx
}
