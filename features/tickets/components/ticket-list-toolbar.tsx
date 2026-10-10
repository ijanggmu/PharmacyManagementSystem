"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { IssueSeverity, TicketStatus } from "@/lib/api/tickets-api"
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  isTicketPriority,
  isTicketStatus,
} from "@/features/tickets/lib/ticket-list-params"
import { useDebouncedValue } from "@/features/tickets/hooks/use-debounced-value"

const ALL = "all"

/**
 * Text input whose value is committed (debounced) to the URL. External URL changes (Back,
 * "Clear filters") flow back into the field without fighting the user's typing.
 */
function useCommittedText(urlValue: string, commit: (value: string) => void, delayMs = 250) {
  const [text, setText] = useState(urlValue)
  const lastCommitted = useRef(urlValue)
  const debounced = useDebouncedValue(text, delayMs)
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  }, [commit])

  useEffect(() => {
    if (urlValue !== lastCommitted.current) {
      lastCommitted.current = urlValue
      setText(urlValue)
    }
  }, [urlValue])

  useEffect(() => {
    const trimmed = debounced.trim()
    if (trimmed !== lastCommitted.current) {
      lastCommitted.current = trimmed
      commitRef.current(trimmed)
    }
  }, [debounced])

  const clear = () => {
    setText("")
    if (lastCommitted.current !== "") {
      lastCommitted.current = ""
      commitRef.current("")
    }
  }

  /** Empties the field without committing — the caller updates the URL itself. */
  const reset = () => {
    setText("")
    lastCommitted.current = ""
  }

  return { text, setText, clear, reset }
}

interface TicketListToolbarProps {
  idPrefix: string
  q: string
  status: TicketStatus | null
  priority: IssueSeverity | null
  /** Pass to show the tenant-id filter (all-tenants desk). */
  tenant?: string
  searchPlaceholder: string
  onQueryChange: (q: string) => void
  onStatusChange: (status: TicketStatus | null) => void
  onPriorityChange: (priority: IssueSeverity | null) => void
  onTenantChange?: (tenant: string) => void
  hasFilters: boolean
  onClearFilters: () => void
}

export function TicketListToolbar({
  idPrefix,
  q,
  status,
  priority,
  tenant,
  searchPlaceholder,
  onQueryChange,
  onStatusChange,
  onPriorityChange,
  onTenantChange,
  hasFilters,
  onClearFilters,
}: TicketListToolbarProps) {
  const search = useCommittedText(q, onQueryChange)
  const tenantField = useCommittedText(tenant ?? "", onTenantChange ?? noop)
  const showTenant = tenant !== undefined && onTenantChange !== undefined

  return (
    <div className="flex flex-col gap-2" role="search" aria-label="Filter tickets">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor={`${idPrefix}-search`} className="sr-only">
            Search tickets
          </Label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id={`${idPrefix}-search`}
            type="search"
            value={search.text}
            onChange={(e) => search.setText(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 pl-8 pr-9 sm:h-9 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {search.text && (
            <button
              type="button"
              onClick={search.clear}
              aria-label="Clear search"
              className="absolute right-0.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-8"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {showTenant && (
          <div className="relative min-w-0 sm:w-56">
            <Label htmlFor={`${idPrefix}-tenant`} className="sr-only">
              Tenant ID (exact)
            </Label>
            <Building2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${idPrefix}-tenant`}
              value={tenantField.text}
              onChange={(e) => tenantField.setText(e.target.value)}
              placeholder="Exact tenant ID"
              className="h-10 pl-8 font-mono text-xs sm:h-9"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Select value={status ?? ALL} onValueChange={(v) => onStatusChange(isTicketStatus(v) ? v : null)}>
          <SelectTrigger id={`${idPrefix}-status`} aria-label="Filter by status" className="h-10 w-full sm:h-9 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority ?? ALL} onValueChange={(v) => onPriorityChange(isTicketPriority(v) ? v : null)}>
          <SelectTrigger id={`${idPrefix}-priority`} aria-label="Filter by priority" className="h-10 w-full sm:h-9 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="col-span-2 h-10 justify-self-start text-muted-foreground sm:col-span-1 sm:h-8"
            onClick={() => {
              search.reset()
              tenantField.reset()
              onClearFilters()
            }}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}

function noop(): void {}
