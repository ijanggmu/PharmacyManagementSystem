"use client"

/**
 * Opening balances (Accounting › Finance setup): the account-level trial balance a pharmacy goes live
 * with. One active opening voucher per branch; Edit reverses it and posts a replacement, Reset only
 * reverses it, and every change is kept in the history (backend: Accounting OpeningBalanceService).
 * Anyone with accounting read sees the balances and history; Set/Edit/Reset need
 * Accounting.Vouchers.ManageOpeningBalances.
 */

import { useEffect, useState } from "react"
import { ChevronDown, Landmark, PackageOpen, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton"
import { QueryState, InlineAlert } from "@/features/accounting/components/accounting-ui"
import { VoucherDetailSheet } from "@/features/accounting/components/voucher-detail-sheet"
import type { AccountingAccount } from "@/features/accounting/api-client"
import { useOpeningBalancePermissions, useOpeningBalanceState } from "@/features/accounting/hooks/use-opening-balances"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import type { Branch } from "@/lib/api/branches-api"
import { cn } from "@/lib/utils"
import { MigrationImportWizard } from "./opening-balances/migration-import-wizard"
import { OpeningBalanceHistory } from "./opening-balances/opening-balance-history"
import { OpeningBalanceResetDialog } from "./opening-balances/opening-balance-reset-dialog"
import { OpeningBalanceSummary } from "./opening-balances/opening-balance-summary"
import { OpeningBalanceWizard } from "./opening-balances/opening-balance-wizard"

export interface OpeningBalancesPanelProps {
  accounts: AccountingAccount[]
  accountsLoading: boolean
  branches: Branch[]
  /** Branch selected in the accounting filter ("" = all branches). */
  branchFilterId: string
  branchLocked: boolean
  ownBranch?: Branch
  branchAccessReady: boolean
}

export function OpeningBalancesPanel({
  accounts,
  accountsLoading,
  branches,
  branchFilterId,
  branchLocked,
  ownBranch,
  branchAccessReady,
}: OpeningBalancesPanelProps) {
  const permissions = useOpeningBalancePermissions()
  const [branchId, setBranchId] = useState<string>("")
  const [mode, setMode] = useState<"view" | "edit">("view")
  const [resetOpen, setResetOpen] = useState(false)
  const [voucherId, setVoucherId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  // Opening balances belong to one branch: the filtered branch, else the user's own, else the default.
  useEffect(() => {
    if (!branchAccessReady) return
    if (branchLocked) {
      if (ownBranch?.id && branchId !== ownBranch.id) setBranchId(ownBranch.id)
      return
    }
    if (branchFilterId) {
      setBranchId(branchFilterId)
      return
    }
    if (!branchId) {
      const fallback = ownBranch?.id ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id
      if (fallback) setBranchId(fallback)
    }
  }, [branchAccessReady, branchLocked, ownBranch?.id, branchFilterId, branches, branchId])

  useEffect(() => setMode("view"), [branchId])

  const stateQuery = useOpeningBalanceState(branchId || null)
  const state = stateQuery.data
  const branchName = branches.find((b) => b.id === branchId)?.name ?? ownBranch?.name ?? "This branch"
  const activeBranches = branches.filter((b) => b.isActive)

  const ready = permissions.loaded && branchAccessReady && !!branchId

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
            Opening balances
            {state && (state.isSet ? <Badge variant="success">Set</Badge> : <Badge variant="warning">Not set</Badge>)}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What the pharmacy had and owed on the day it started using this system. They post as one balanced opening voucher,
            so your trial balance, balance sheet and ledgers start from the right figures.
          </p>
        </div>
        {branchAccessReady && (
          <div className="w-full space-y-1.5 sm:w-56 sm:shrink-0">
            {branchLocked || activeBranches.length <= 1 ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">Branch</span>
                {branchLocked ? (
                  <BranchScopeBadge branch={ownBranch} className="w-full" />
                ) : (
                  <p className="text-sm font-medium">{branchName}</p>
                )}
              </>
            ) : (
              <>
                <Label htmlFor="ob-branch" className="text-xs text-muted-foreground">
                  Branch
                </Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={mode === "edit"}>
                  <SelectTrigger id="ob-branch" className="w-full">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}
      </div>

      {!ready || accountsLoading ? (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">Loading opening balances</span>
          <Skeleton className="h-10" />
          <SkeletonCard />
        </div>
      ) : !permissions.canView ? (
        <EmptyState icon={ShieldCheck} title="No access" description="You need accounting read access to see opening balances." />
      ) : (
        <QueryState
          isLoading={stateQuery.isLoading}
          error={stateQuery.error}
          onRetry={() => void stateQuery.refetch()}
          retrying={stateQuery.isFetching}
          skeleton={<SkeletonCard />}
          errorTitle="Couldn't load opening balances"
        >
          {state && (
            <div className="space-y-6">
              {state.legacyOpeningVoucherCount > 0 && (
                <InlineAlert tone="warning" title="Opening entries from the onboarding import already exist">
                  {state.legacyOpeningVoucherCount} opening voucher{state.legacyOpeningVoucherCount === 1 ? " was" : "s were"} posted by
                  the onboarding import (stock, cash, bank, customers or suppliers). Those amounts are already in the ledger, so
                  don&apos;t enter them again here or they will be counted twice.
                </InlineAlert>
              )}

              {state.isSet && mode === "view" ? (
                <OpeningBalanceSummary
                  state={state}
                  canManage={permissions.canManage}
                  onEdit={() => setMode("edit")}
                  onReset={() => setResetOpen(true)}
                  onOpenVoucher={setVoucherId}
                />
              ) : state.isSet && mode === "edit" && permissions.canManage ? (
                <OpeningBalanceWizard
                  key={`edit-${branchId}-${state.version}`}
                  mode="edit"
                  branchId={branchId}
                  branchName={branchName}
                  accounts={accounts}
                  state={state}
                  onDone={() => setMode("view")}
                  onCancel={() => setMode("view")}
                />
              ) : permissions.canManage ? (
                <OpeningBalanceWizard
                  key={`set-${branchId}-${state.version}`}
                  mode="set"
                  branchId={branchId}
                  branchName={branchName}
                  accounts={accounts}
                  state={state}
                  onDone={() => setMode("view")}
                />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <EmptyState
                      icon={Landmark}
                      title="Opening balances aren't set for this branch"
                      description="Ask someone with permission to manage opening balances (usually the owner or accountant) to set them up."
                    />
                  </CardContent>
                </Card>
              )}

              <OpeningBalanceHistory branchId={branchId} onOpenVoucher={setVoucherId} />

              {permissions.canManage && (
                <Card>
                  <button
                    type="button"
                    onClick={() => setImportOpen((o) => !o)}
                    aria-expanded={importOpen}
                    aria-controls="ob-migration-import"
                    className="flex w-full items-start gap-3 rounded-xl px-6 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">Onboarding import: stock batches & party detail</span>
                      <span className="block text-xs text-muted-foreground">
                        Imports stock batches (with expiry) and supplier statement balances. It posts its own opening vouchers, so
                        don&apos;t enter the same amounts above as well.
                      </span>
                    </span>
                    <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 transition-transform", importOpen && "rotate-180")} aria-hidden />
                  </button>
                  {importOpen && (
                    <CardContent id="ob-migration-import" className="border-t pt-6">
                      <MigrationImportWizard />
                    </CardContent>
                  )}
                </Card>
              )}
            </div>
          )}
        </QueryState>
      )}

      {state && permissions.canManage && (
        <OpeningBalanceResetDialog open={resetOpen} onOpenChange={setResetOpen} branchId={branchId} branchName={branchName} state={state} />
      )}
      <VoucherDetailSheet voucherId={voucherId} onOpenChange={(open) => !open && setVoucherId(null)} branchName={branchName} />
    </div>
  )
}
