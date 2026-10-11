"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { effectiveBranchFilter } from "@/features/branches/lib/branch-access"
import type { Branch } from "@/lib/api/branches-api"
import { getPresetRange } from "@/features/accounting/lib/date-presets"

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
  /** Period + branch in the shape the report hooks take. */
  period: { from: string; to: string; branchId?: string }
  /** Name of the branch selected in the filter, or null for all branches. */
  branchName: string | null
  branches: Branch[]
  branchFilterId: string
  setBranchFilterId: (id: string) => void
  /** The user's role can't view other branches: show their branch read-only instead of a picker. */
  branchLocked: boolean
  /** The user's own branch (what a locked filter shows). */
  ownBranch?: Branch
  /** False until permissions and branches are known; don't render the branch control before. */
  branchAccessReady: boolean
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
  /** Closing balance for the whole period — always the full-period figure, independent of which page of glRows is loaded. */
  glClosing: number
  setGlClosing: React.Dispatch<React.SetStateAction<number>>
  glPage: number
  setGlPage: React.Dispatch<React.SetStateAction<number>>
  glTotalCount: number
  setGlTotalCount: React.Dispatch<React.SetStateAction<number>>
  glTotalPages: number
  setGlTotalPages: React.Dispatch<React.SetStateAction<number>>
  glLoading: boolean
  setGlLoading: React.Dispatch<React.SetStateAction<boolean>>
  /** "accountId|from|to|branchId" of the ledger currently held in glRows — lets the ledger tab tell fresh
   *  data from data loaded for another period/branch before it was mounted. */
  glLoadedKey: string
  setGlLoadedKey: React.Dispatch<React.SetStateAction<string>>
  /** Loads the ledger for a given account code into the shared GL state — call this,
   *  then router.push to the ledger page, to reproduce "click account -> jump to GL". */
  loadLedgerForAccountCode: (accountCode: string) => Promise<void>
}

const AccountingContext = createContext<AccountingContextValue | null>(null)

export function AccountingProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => getPresetRange("last_30_days"))

  const [accounts, setAccounts] = useState<AccountingAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  const branchAccess = useBranchAccess()
  const branches = branchAccess.branches
  // "" = all branches. Only ViewAll holders can change it; everyone else is pinned to their own branch.
  const [selectedBranchId, setSelectedBranchId] = useState<string>("")
  const [branchSeeded, setBranchSeeded] = useState(false)
  const branchFilterId = effectiveBranchFilter(branchAccess, selectedBranchId)
  const branchLocked = !branchAccess.isLoading && !branchAccess.canViewAll
  const setBranchFilterId = useCallback(
    (id: string) => {
      if (branchAccess.canViewAll) setSelectedBranchId(id)
    },
    [branchAccess.canViewAll]
  )

  // Start ViewAll holders on their saved branch, as before; "all" when they have none.
  useEffect(() => {
    if (branchSeeded || branchAccess.isLoading) return
    if (branchAccess.canViewAll && branchAccess.currentBranchId) setSelectedBranchId(branchAccess.ownBranchId ?? "")
    setBranchSeeded(true)
  }, [branchSeeded, branchAccess.isLoading, branchAccess.canViewAll, branchAccess.currentBranchId, branchAccess.ownBranchId])

  const [lockDate, setLockDate] = useState<string | null>(null)
  const [lockDraft, setLockDraft] = useState("")
  const [lockSaving, setLockSaving] = useState(false)

  const [glAccountId, setGlAccountId] = useState<string>("")
  const [glRows, setGlRows] = useState<GlRow[]>([])
  const [glOpening, setGlOpening] = useState(0)
  const [glClosing, setGlClosing] = useState(0)
  const [glPage, setGlPage] = useState(1)
  const [glTotalCount, setGlTotalCount] = useState(0)
  const [glTotalPages, setGlTotalPages] = useState(1)
  const [glLoading, setGlLoading] = useState(false)
  const [glLoadedKey, setGlLoadedKey] = useState("")

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const period = useMemo(
    () => ({ from: rangeStr.from, to: rangeStr.to, branchId: branchFilterId || undefined }),
    [rangeStr.from, rangeStr.to, branchFilterId]
  )
  const branchName = useMemo(() => {
    const b = branches.find((x) => x.id === branchFilterId)
    return b ? `${b.name} (${b.code})` : null
  }, [branches, branchFilterId])

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
        // Same branch scope as the report the user drilled down from.
        const branchId = branchFilterId || undefined
        const res = await accountingApi.generalLedgerPage(account.id, rangeStr.from, rangeStr.to, branchId, 1)
        setGlOpening(Number(res.opening_balance ?? 0))
        setGlClosing(Number(res.closing_balance ?? 0))
        setGlRows((res.rows || []) as GlRow[])
        setGlPage(res.pageNumber)
        setGlTotalCount(res.totalCount)
        setGlTotalPages(Math.max(1, res.totalPages))
        setGlLoadedKey(`${account.id}|${rangeStr.from}|${rangeStr.to}|${branchId ?? ""}`)
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
    [accounts, dateRange, rangeStr.from, rangeStr.to, branchFilterId, toast]
  )

  const value: AccountingContextValue = {
    dateRange,
    setDateRange,
    rangeStr,
    period,
    branchName,
    branches,
    branchFilterId,
    setBranchFilterId,
    branchLocked,
    ownBranch: branchAccess.ownBranch,
    branchAccessReady: !branchAccess.isLoading,
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
    glClosing,
    setGlClosing,
    glPage,
    setGlPage,
    glTotalCount,
    setGlTotalCount,
    glTotalPages,
    setGlTotalPages,
    glLoading,
    setGlLoading,
    glLoadedKey,
    setGlLoadedKey,
    loadLedgerForAccountCode,
  }

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>
}

export function useAccountingContext(): AccountingContextValue {
  const ctx = useContext(AccountingContext)
  if (!ctx) throw new Error("useAccountingContext must be used within AccountingProvider")
  return ctx
}
