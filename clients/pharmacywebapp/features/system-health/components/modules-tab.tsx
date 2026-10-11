"use client"

import { useMemo, useState } from "react"
import { Boxes, Search } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDebouncedValue } from "../hooks/use-system-health-data"
import { filterAndSortModules, maxLatency, type ModuleRow, type ModuleSort, type ModuleStatusFilter } from "../lib/modules"
import { paginate } from "../lib/paginate"
import { ModuleTableRow } from "./module-row"
import { PageFooter, SectionCard } from "./status-ui"

const PER_PAGE = 8

export interface ModulesTabProps {
  rows: ModuleRow[]
  loading: boolean
  error: Error | null
  onRetry: () => void
  showMigrations: boolean
  migrationsError: Error | null
}

export function ModulesTab({ rows, loading, error, onRetry, showMigrations, migrationsError }: ModulesTabProps) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<ModuleStatusFilter>("all")
  const [sort, setSort] = useState<ModuleSort>("name")
  const [pageState, setPageState] = useState({ page: 1, key: "" })
  const debounced = useDebouncedValue(search, 200)

  // Any filter change resets to page 1 (derived instead of an effect so there's no extra render).
  const filterKey = `${debounced}|${status}|${sort}`
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = (p: number) => setPageState({ page: p, key: filterKey })

  const filtered = useMemo(() => filterAndSortModules(rows, { search: debounced, status, sort }), [rows, debounced, status, sort])
  const pageData = paginate(filtered, page, PER_PAGE)
  const max = useMemo(() => maxLatency(rows), [rows])
  const issues = rows.filter((r) => r.hasIssue).length
  const cols = showMigrations ? 5 : 3

  if (error && rows.length === 0) {
    return <ErrorState title="Couldn't load module health" message={error.message} onRetry={onRetry} />
  }

  return (
    <SectionCard
      title="Business modules"
      titleId="modules-title"
      icon={Boxes}
      description={
        showMigrations
          ? "Each module's database check merged with its EF Core migration state. Expand a row for raw details."
          : "Each module's database health check. Expand a row for raw details."
      }
      aside={
        !loading && rows.length > 0 ? (
          <span className="num text-xs font-medium text-muted-foreground">
            {rows.length} modules{issues ? ` · ${issues} with issues` : ""}
          </span>
        ) : null
      }
    >
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:px-5" role="search" aria-label="Filter modules">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules or migrations"
            aria-label="Search modules"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={status} onValueChange={(v) => setStatus(v as ModuleStatusFilter)}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              <SelectItem value="issues">With issues</SelectItem>
              <SelectItem value="healthy">Healthy only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as ModuleSort)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Sort modules">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="latency">Sort: Latency</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showMigrations && migrationsError && (
        <p className="border-b bg-warning/10 px-4 py-2 text-xs text-warning sm:px-5" role="alert">
          Migration status couldn&apos;t be loaded ({migrationsError.message}). Showing database health only.
        </p>
      )}

      <Table>
        <TableCaption className="sr-only">
          Business modules with database status{showMigrations ? " and migration state" : ""}. Page {pageData.page} of {pageData.totalPages}.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 sm:pl-5">Module</TableHead>
            <TableHead>Database</TableHead>
            <TableHead>Latency</TableHead>
            {showMigrations && <TableHead>Last applied migration</TableHead>}
            {showMigrations && <TableHead className="pr-4 text-right sm:pr-5">Pending</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0 ? (
            Array.from({ length: PER_PAGE }).map((_, i) => (
              <TableRow key={i} aria-hidden>
                <TableCell className="py-1.5 pl-4 sm:pl-5">
                  <div className="flex h-10 items-center gap-2.5">
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                {showMigrations && <TableCell><Skeleton className="h-4 w-40" /></TableCell>}
                {showMigrations && <TableCell className="pr-4 sm:pr-5"><Skeleton className="ml-auto h-5 w-16" /></TableCell>}
              </TableRow>
            ))
          ) : pageData.items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={cols} className="whitespace-normal">
                <EmptyState
                  size="compact"
                  icon={Boxes}
                  title={rows.length === 0 ? "No modules reported" : "No modules match"}
                  description={rows.length === 0 ? "The readiness probe didn't return any module database checks." : "Try a different search or status filter."}
                  action={
                    rows.length > 0
                      ? {
                          label: "Clear filters",
                          onClick: () => {
                            setSearch("")
                            setStatus("all")
                          },
                        }
                      : undefined
                  }
                />
              </TableCell>
            </TableRow>
          ) : (
            pageData.items.map((row) => <ModuleTableRow key={row.key} row={row} maxLatencyMs={max} showMigrations={showMigrations} />)
          )}
        </TableBody>
      </Table>
      <PageFooter page={pageData} onPageChange={setPage} />
    </SectionCard>
  )
}
