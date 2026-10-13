"use client"

import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { ShieldCheck } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCurrency } from "@/lib/contexts/currency-context"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { approvalsApi, type ApprovalLogFilters } from "@/features/approvals/api-client"
import {
  APPROVAL_ACTIONS,
  approvalActionLabel,
  approvalStatusLabel,
  formatApprovalAmount,
} from "@/features/approvals/lib/approval"

const PAGE_SIZE = 25

/**
 * Reports → Approvals log: every manager approval (discount over cap, cancelled sale, large refund, credit-limit
 * override, price below cost) — who asked, who approved, for how much, and whether it was used.
 */
export default function ApprovalsLogPage() {
  const { formatCurrency } = useCurrency()
  // Filters and page live in one state, so changing a filter can't fetch a stale page.
  const [filters, setFilters] = useState<ApprovalLogFilters>({ page: 1, pageSize: PAGE_SIZE, action: "all", search: "" })

  const log = useQuery({
    queryKey: ["approvals-log", filters],
    queryFn: () => approvalsApi.log(filters),
    placeholderData: keepPreviousData,
  })

  const page = filters.page ?? 1
  const rows = log.data?.items ?? []

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Approvals log"
          description="Manager approvals given at the counter: discounts over the limit, cancelled sales, large refunds, credit-limit and price overrides."
          icon={ShieldCheck}
        />
        <Section spacing="lg">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={filters.action ?? "all"}
                  onValueChange={(action) => setFilters((f) => ({ ...f, action, page: 1 }))}
                >
                  <SelectTrigger className="sm:w-60" aria-label="Approval type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All approvals</SelectItem>
                    {APPROVAL_ACTIONS.map((action) => (
                      <SelectItem key={action} value={action}>
                        {approvalActionLabel(action)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="sm:max-w-xs"
                  placeholder="Search approver, cashier or reference"
                  aria-label="Search approvals"
                  value={filters.search ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
                />
              </div>

              {log.isLoading ? (
                <LoadingState text="Loading approvals" />
              ) : log.isError ? (
                <ErrorState
                  message={log.error instanceof Error ? log.error.message : "The approvals log couldn't be loaded."}
                  onRetry={() => void log.refetch()}
                  retrying={log.isFetching}
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  size="compact"
                  title="No approvals yet"
                  description="Approvals appear here when a manager signs off a restricted action at the counter."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>What</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Asked by</TableHead>
                        <TableHead>Approved by</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap">{formatNepalDateTime(row.approvedAtUtc)}</TableCell>
                          <TableCell>
                            <div className="font-medium">{approvalActionLabel(row.action)}</div>
                            {row.targetRef && (
                              <div className="max-w-[14rem] truncate text-xs text-muted-foreground" title={row.targetRef}>
                                {row.targetRef}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="num text-right">{formatApprovalAmount(row.action, row.amount, formatCurrency)}</TableCell>
                          <TableCell>{row.requestedByName ?? row.requestedByUserId}</TableCell>
                          <TableCell>{row.approverName ?? row.approverUserId}</TableCell>
                          <TableCell className="max-w-[16rem] text-sm text-muted-foreground">{row.reason ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={row.status === "used" ? "success" : "muted"}>{approvalStatusLabel(row.status)}</Badge>
                            {row.usedAtUtc && (
                              <div className="mt-1 text-xs text-muted-foreground">{formatNepalDateTime(row.usedAtUtc)}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {log.data && (
                <Pagination
                  currentPage={page}
                  totalPages={log.data.totalPages}
                  totalItems={log.data.totalCount}
                  itemsPerPage={PAGE_SIZE}
                  startIndex={(page - 1) * PAGE_SIZE}
                  onPageChange={(next) => setFilters((f) => ({ ...f, page: next }))}
                />
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
