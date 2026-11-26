"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Pagination } from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Ban, Building2, CheckCircle2, ChevronRight, Layers, Pause, Plus, ShieldOff, Users } from "lucide-react"
import { tenantsApi } from "@/features/tenants/api-client"
import { CreateTenantDialog } from "@/features/tenants/components/create-tenant-dialog"
import type { PagedResponse, Subscription, SubscriptionStatus, TenantListItem } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"

const PAGE_SIZE = 20

function isPast(value: string): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

export function TenantStatusBadge({ isActive, validUpto }: { isActive: boolean; validUpto: string }) {
  if (!isActive) {
    return (
      <Badge variant="danger">
        <ShieldOff aria-hidden />
        Suspended
      </Badge>
    )
  }
  if (isPast(validUpto)) {
    return (
      <Badge variant="warning">
        <AlertTriangle aria-hidden />
        Expired
      </Badge>
    )
  }
  return (
    <Badge variant="success">
      <CheckCircle2 aria-hidden />
      Active
    </Badge>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString()
}

/** Normalizes the status: the API serializes the enum as its string name, but guard the numeric fallback too. */
function normalizeSubscriptionStatus(status: Subscription["status"]): SubscriptionStatus {
  if (status === "Active" || status === "Suspended" || status === "Cancelled") return status
  const byIndex: SubscriptionStatus[] = ["Active", "Suspended", "Cancelled"]
  return byIndex[status as unknown as number] ?? "Active"
}

export function SubscriptionStatusBadge({ status }: { status: Subscription["status"] }) {
  const normalized = normalizeSubscriptionStatus(status)
  if (normalized === "Suspended") {
    return (
      <Badge variant="warning">
        <Pause aria-hidden />
        Suspended
      </Badge>
    )
  }
  if (normalized === "Cancelled") {
    return (
      <Badge variant="muted">
        <Ban aria-hidden />
        Cancelled
      </Badge>
    )
  }
  return (
    <Badge variant="success">
      <CheckCircle2 aria-hidden />
      Active
    </Badge>
  )
}

export function TenantManagement() {
  const [pageNumber, setPageNumber] = useState(1)
  const [data, setData] = useState<PagedResponse<TenantListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Subscriptions across every tenant, fetched once in a single call (not per row) so the list can
  // show plan + subscription status and the summary header can roll up all tenants, not just the
  // current page.
  const [subscriptions, setSubscriptions] = useState<Map<string, Subscription> | null>(null)
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async (page: number) => {
    setLoading(true)
    setLoadError(null)
    try {
      setData(await tenantsApi.listTenants(page, PAGE_SIZE))
    } catch (err) {
      setLoadError(err instanceof DotnetApiError ? err.normalized.message : "Could not load tenants.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(pageNumber)
  }, [load, pageNumber])

  useEffect(() => {
    let cancelled = false
    tenantsApi
      .listSubscriptions()
      .then((rows) => {
        if (!cancelled) setSubscriptions(new Map(rows.map((s) => [s.tenantId, s])))
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSubscriptionsError(err instanceof DotnetApiError ? err.normalized.message : "Could not load subscriptions.")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openCreate = () => setCreateOpen(true)

  const onCreated = async () => {
    setPageNumber(1)
    await load(1)
  }

  const totalItems = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1
  const startIndex = (pageNumber - 1) * PAGE_SIZE

  // Summary rolls up ALL tenants (from the subscriptions call, which is unpaginated), not just the
  // current page — the subscriptions list is the only cross-tenant signal we have that isn't paged.
  const summary = (() => {
    if (!subscriptions) return null
    let active = 0
    let suspended = 0
    let cancelled = 0
    const byPlan = new Map<string, number>()
    for (const sub of subscriptions.values()) {
      const status = normalizeSubscriptionStatus(sub.status)
      if (status === "Active") active += 1
      else if (status === "Suspended") suspended += 1
      else cancelled += 1
      byPlan.set(sub.planName, (byPlan.get(sub.planName) ?? 0) + 1)
    }
    return { total: subscriptions.size, active, suspended, cancelled, byPlan: Array.from(byPlan.entries()) }
  })()

  return (
    <>
      {subscriptions ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground" aria-hidden />
              <div>
                <p className="num text-lg font-semibold leading-none">{summary?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  {(summary?.total ?? 0) === 1 ? "tenant with a subscription" : "tenants with a subscription"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">
                <CheckCircle2 aria-hidden />
                {summary?.active ?? 0} active
              </Badge>
              <Badge variant="warning">
                <Pause aria-hidden />
                {summary?.suspended ?? 0} suspended
              </Badge>
              <Badge variant="muted">
                <Ban aria-hidden />
                {summary?.cancelled ?? 0} cancelled
              </Badge>
            </div>
            {summary && summary.byPlan.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {summary.byPlan.map(([planName, count]) => (
                  <Badge key={planName} variant="info">
                    <Layers aria-hidden />
                    {count} {planName}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : subscriptionsError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{subscriptionsError} Plan and subscription columns below may be blank.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-base">All tenants</CardTitle>
            {data ? (
              <p className="num mt-1 text-sm text-muted-foreground">
                {totalItems} {totalItems === 1 ? "pharmacy" : "pharmacies"} on this platform
              </p>
            ) : null}
          </div>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus aria-hidden />
            New tenant
          </Button>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <SkeletonTable rows={5} cols={7} />
          ) : loadError && !data ? (
            <ErrorState
              size="compact"
              title="Couldn't load tenants"
              message={`${loadError} Check your connection and try again.`}
              onRetry={() => void load(pageNumber)}
            />
          ) : data && data.items.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Building2}
              title="No tenants yet"
              description="Create the first pharmacy tenant — it gets its own admin account and sign-in code."
              action={{ label: "New tenant", onClick: openCreate, icon: Plus }}
            />
          ) : (
            <>
              {loadError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Tenant ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Valid until</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((tenant) => {
                      const subscription = subscriptions?.get(tenant.id)
                      return (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">
                          <div className="max-w-[240px] truncate" title={tenant.name}>{tenant.name}</div>
                          <div className="max-w-[240px] truncate text-xs font-normal text-muted-foreground" title={tenant.adminEmail}>
                            {tenant.adminEmail}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{tenant.id}</TableCell>
                        <TableCell>
                          <TenantStatusBadge isActive={tenant.isActive} validUpto={tenant.validUpto} />
                        </TableCell>
                        <TableCell>{subscription?.planName ?? tenant.plan ?? "—"}</TableCell>
                        <TableCell>
                          {subscription ? (
                            <SubscriptionStatusBadge status={subscription.status} />
                          ) : (
                            <Badge variant="muted">No subscription</Badge>
                          )}
                        </TableCell>
                        <TableCell className="num text-muted-foreground">{formatDate(tenant.validUpto)}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={`/dashboard/tenants/${encodeURIComponent(tenant.id)}/overview`}
                              aria-label={`View ${tenant.name}`}
                            >
                              View
                              <ChevronRight aria-hidden />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                currentPage={pageNumber}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={PAGE_SIZE}
                startIndex={startIndex}
                onPageChange={setPageNumber}
                className="mt-4"
              />
            </>
          )}
        </CardContent>
      </Card>

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onCreated} />
    </>
  )
}
