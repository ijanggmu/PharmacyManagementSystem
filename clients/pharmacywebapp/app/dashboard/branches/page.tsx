"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Building2, CheckCircle2, CircleSlash, GitBranch, Pencil, Plus, PowerOff, Search, Star } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/hooks/use-toast"
import {
  branchErrorMessage,
  canManageBranches,
  deactivateBranch,
  listBranches,
  type Branch,
} from "@/lib/api/branches-api"
import { BranchFormDialog } from "@/features/branches/components/branch-form-dialog"
import { DefaultBranchPrompt } from "@/features/branches/components/default-branch-prompt"
import { branchContextQueryKey } from "@/features/branches/hooks/use-branch-access"
import { branchesQueryKey } from "@/features/branches/hooks/use-branches"
import { useQueryClient } from "@tanstack/react-query"

const PAGE_SIZE = 10
const DEFAULT_BRANCH_TOOLTIP = "The default branch cannot be deactivated"

interface SessionResponse {
  user?: { permissions?: string[] }
}

export default function BranchesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [sessionChecked, setSessionChecked] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [deactivating, setDeactivating] = useState<Branch | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)

  const loadBranches = useCallback(async () => {
    try {
      setBranches(await listBranches())
      setLoadError(null)
      // Keep the shared branch pickers (user forms, setup prompt) and the header's branch switcher in step with
      // edits made here — a second branch must show the switcher straight away.
      void queryClient.invalidateQueries({ queryKey: branchesQueryKey })
      void queryClient.invalidateQueries({ queryKey: branchContextQueryKey })
    } catch (error) {
      setBranches([])
      setLoadError(branchErrorMessage(error, "Could not load branches"))
    }
  }, [queryClient])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      const body = (await res.json().catch(() => ({}))) as SessionResponse
      if (cancelled) return
      setCanManage(canManageBranches(body.user?.permissions ?? []))
      setSessionChecked(true)
      await loadBranches()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [loadBranches])

  const filteredBranches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return branches
    return branches.filter((b) => [b.name, b.code].some((f) => f.toLowerCase().includes(term)))
  }, [search, branches])

  const totalItems = filteredBranches.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * PAGE_SIZE
  const paginatedBranches = filteredBranches.slice(startIndex, startIndex + PAGE_SIZE)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (branch: Branch) => {
    setEditing(branch)
    setFormOpen(true)
  }

  const confirmDeactivate = async () => {
    if (!deactivating) return
    setDeactivateBusy(true)
    try {
      await deactivateBranch(deactivating.id)
      toast({ title: "Branch deactivated", description: `${deactivating.name} is now inactive.` })
      setDeactivating(null)
      await loadBranches()
    } catch (error) {
      toast({
        title: "Could not deactivate branch",
        description: branchErrorMessage(error, "Request failed"),
        variant: "destructive",
      })
    } finally {
      setDeactivateBusy(false)
    }
  }

  const isInitialLoading = !sessionChecked || loading
  const activeCount = branches.filter((b) => b.isActive).length

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Branches"
          description={
            canManage
              ? "Create, edit and deactivate your pharmacy branches. Switch branches from the header."
              : "View your pharmacy branches. Switch branches from the header."
          }
          icon={GitBranch}
          actions={
            canManage && !isInitialLoading ? (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                New branch
              </Button>
            ) : undefined
          }
        />

        <DefaultBranchPrompt canManage={canManage} showManageLink={false} />

        <Section spacing="lg">
          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="font-display text-base">All branches</CardTitle>
                {!isInitialLoading && branches.length > 0 ? (
                  <p className="num mt-1 text-sm text-muted-foreground">
                    {activeCount} active of {branches.length}
                  </p>
                ) : null}
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  aria-label="Search branches by name or code"
                  placeholder="Search by name or code"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-8"
                  disabled={isInitialLoading}
                />
              </div>
            </CardHeader>
            <CardContent>
              {isInitialLoading ? (
                <SkeletonTable rows={4} cols={6} />
              ) : loadError ? (
                <ErrorState
                  size="compact"
                  title="Couldn't load branches"
                  message={`${loadError}. Check your connection and try again.`}
                  onRetry={() => void loadBranches()}
                />
              ) : branches.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={Building2}
                  title="No branches yet"
                  description={
                    canManage
                      ? "Add your first branch to track stock, sales and cash per location."
                      : "Branches set up by your administrator will appear here."
                  }
                  action={canManage ? { label: "New branch", onClick: openCreate, icon: Plus } : undefined}
                />
              ) : filteredBranches.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={Search}
                  title="No branches match your search"
                  description={`Nothing matches “${search.trim()}”. Try a different name or code.`}
                  action={{ label: "Clear search", onClick: () => setSearch("") }}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedBranches.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span className="max-w-[200px] truncate" title={b.name}>{b.name}</span>
                                {b.isDefault ? (
                                  <Badge variant="info">
                                    <Star aria-hidden />
                                    Default
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{b.code}</TableCell>
                            <TableCell className="max-w-[220px] truncate text-muted-foreground" title={b.address ?? undefined}>
                              {b.address ?? "—"}
                            </TableCell>
                            <TableCell className="num text-muted-foreground">{b.phone ?? "—"}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground" title={b.email ?? undefined}>
                              {b.email ?? "—"}
                            </TableCell>
                            <TableCell>
                              {b.isActive ? (
                                <Badge variant="success">
                                  <CheckCircle2 aria-hidden />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="muted">
                                  <CircleSlash aria-hidden />
                                  Inactive
                                </Badge>
                              )}
                            </TableCell>
                            {canManage ? (
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(b)} aria-label={`Edit ${b.name}`}>
                                    <Pencil aria-hidden />
                                    Edit
                                  </Button>
                                  {b.isActive ? (
                                    b.isDefault ? (
                                      <span title={DEFAULT_BRANCH_TOOLTIP} className="inline-flex">
                                        <Button variant="ghost" size="sm" disabled aria-label={`Deactivate ${b.name} (unavailable: ${DEFAULT_BRANCH_TOOLTIP})`}>
                                          <PowerOff aria-hidden />
                                          Deactivate
                                        </Button>
                                      </span>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => setDeactivating(b)}
                                        aria-label={`Deactivate ${b.name}`}
                                      >
                                        <PowerOff aria-hidden />
                                        Deactivate
                                      </Button>
                                    )
                                  ) : null}
                                </div>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={PAGE_SIZE}
                    startIndex={startIndex}
                    onPageChange={setCurrentPage}
                    className="mt-4"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>

      {canManage ? (
        <>
          <BranchFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            branch={editing}
            onSaved={loadBranches}
          />
          <ConfirmDialog
            isOpen={deactivating !== null}
            onClose={() => !deactivateBusy && setDeactivating(null)}
            onConfirm={confirmDeactivate}
            title="Deactivate branch?"
            description={`${deactivating?.name ?? "This branch"} will be marked inactive and can no longer be used for sales or stock. You can reactivate it from Edit.`}
            confirmText={deactivateBusy ? "Deactivating…" : "Deactivate branch"}
            variant="destructive"
          />
        </>
      ) : null}
    </DashboardLayout>
  )
}
