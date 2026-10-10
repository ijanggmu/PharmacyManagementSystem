"use client"

import { useId, useState } from "react"
import {
  Bell,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  KeyRound,
  MessageSquare,
  Pill,
  Rocket,
  ScrollText,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { latencyFraction, shortMigrationName, type ModuleRow as ModuleRowData } from "../lib/modules"
import { DetailList, StatusLabel } from "./status-ui"

const MODULE_ICONS: Record<string, LucideIcon> = {
  identity: KeyRound,
  multitenancy: Building2,
  auditing: ScrollText,
  billing: CreditCard,
  files: FolderOpen,
  sales: ShoppingCart,
  accounting: Calculator,
  catalog: Pill,
  chat: MessageSquare,
  customers: Users,
  inventory: Boxes,
  notifications: Bell,
  onboarding: Rocket,
  prescriptions: FileText,
  purchasing: ShoppingBag,
  reference: BookOpen,
  suppliers: Truck,
  tickets: Ticket,
  webhooks: Webhook,
}

const BAR_TONE = {
  Healthy: "bg-primary/60",
  Degraded: "bg-warning",
  Unhealthy: "bg-destructive",
  Unknown: "bg-muted-foreground/40",
} as const

export function ModuleTableRow({ row, maxLatencyMs, showMigrations }: { row: ModuleRowData; maxLatencyMs: number; showMigrations: boolean }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const Icon = MODULE_ICONS[row.key] ?? Database
  const fraction = latencyFraction(row.latencyMs, maxLatencyMs)
  const checkError = row.check && row.check.status !== "Healthy" ? row.check.description : null
  const errorText = checkError ?? (showMigrations ? row.migrationError : null)
  const colSpan = showMigrations ? 5 : 3

  return (
    <>
      <TableRow className={cn(open && "border-b-0 bg-muted/30")}>
        <TableCell className="py-1.5 pl-2 sm:pl-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="flex min-h-10 w-full min-w-[180px] cursor-pointer items-center gap-2.5 rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none", open && "rotate-90")}
              aria-hidden
            />
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{row.name}</span>
              {errorText && (
                <span className="block max-w-[260px] truncate text-xs text-destructive" title={errorText}>
                  {errorText}
                </span>
              )}
            </span>
            <span className="sr-only">{open ? "Hide details" : "Show details"}</span>
          </button>
        </TableCell>
        <TableCell>
          <StatusLabel status={row.dbStatus} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <span className="num w-14 text-right text-xs text-muted-foreground">{row.latencyMs === null ? "—" : `${Math.round(row.latencyMs)} ms`}</span>
            <span className="relative h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={cn("absolute inset-0 origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none", BAR_TONE[row.dbStatus])}
                style={{ transform: `scaleX(${fraction})` }}
              />
            </span>
          </div>
        </TableCell>
        {showMigrations && (
          <TableCell className="max-w-[240px]">
            <span className="block truncate font-mono text-xs text-muted-foreground" title={row.migration?.lastAppliedMigration ?? undefined}>
              {row.migration ? shortMigrationName(row.migration.lastAppliedMigration) : "—"}
            </span>
          </TableCell>
        )}
        {showMigrations && (
          <TableCell className="pr-4 text-right sm:pr-5">
            {row.migrationError ? (
              <Badge variant="danger">Error</Badge>
            ) : row.pendingCount > 0 ? (
              <Badge variant="warning" className="num">
                {row.pendingCount} pending
              </Badge>
            ) : row.migration ? (
              <Badge variant="success">Current</Badge>
            ) : (
              <Badge variant="muted">—</Badge>
            )}
          </TableCell>
        )}
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={colSpan} className="px-4 pt-0 pb-4 whitespace-normal sm:px-5">
            <div id={detailsId} className="grid gap-4 rounded-lg border bg-card p-3.5 animate-fade-in motion-reduce:animate-none md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Database check</p>
                {row.check ? (
                  <>
                    <p className="font-mono text-xs text-muted-foreground">{row.check.name}</p>
                    {row.check.description && <p className="text-xs">{row.check.description}</p>}
                    <DetailList details={row.check.details} />
                    {!row.check.description && !row.check.details && <p className="text-xs text-muted-foreground">No extra details reported.</p>}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">The readiness probe doesn&apos;t include a database check for this module.</p>
                )}
              </div>
              {showMigrations && (
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Migrations</p>
                  {!row.migration ? (
                    <p className="text-xs text-muted-foreground">No migration context reported for this module.</p>
                  ) : (
                    <>
                      <p className="text-xs break-all">
                        <span className="text-muted-foreground">Last applied: </span>
                        <span className="font-mono">{row.migration.lastAppliedMigration ?? "None"}</span>
                      </p>
                      {row.migration.provider && <p className="text-xs text-muted-foreground">Provider: {row.migration.provider}</p>}
                      {row.migrationError && <p className="text-xs break-words text-destructive">{row.migrationError}</p>}
                      {row.migration.pendingMigrations.length > 0 ? (
                        <ul className="space-y-1">
                          {row.migration.pendingMigrations.map((m) => (
                            <li key={m} className="font-mono text-xs break-all text-warning">
                              {m}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        !row.migrationError && <p className="text-xs text-muted-foreground">No pending migrations.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
