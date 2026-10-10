"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TICKET_PAGE_SIZES, isTicketPageSize, type TicketPageSize } from "@/features/tickets/lib/ticket-list-params"
import { pageWindow, totalPagesFor } from "@/features/tickets/lib/ticket-list-utils"

interface TicketListPaginationProps {
  idPrefix: string
  page: number
  pageSize: TicketPageSize
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: TicketPageSize) => void
}

/**
 * Wide containers use the shared components/ui/pagination; narrow ones (phones, or the list
 * column while the detail pane is open) get a compact pager with 40px targets so nothing
 * overflows horizontally. Driven by a container query, not the viewport.
 */
export function TicketListPagination({ idPrefix, page, pageSize, totalCount, onPageChange, onPageSizeChange }: TicketListPaginationProps) {
  const totalPages = totalPagesFor(totalCount, pageSize)
  const { startIndex, from, to } = pageWindow(page, pageSize, totalCount)
  if (totalCount === 0) return null

  const sizeSelect = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={`${idPrefix}-page-size`} className="whitespace-nowrap">
        Per page
      </label>
      <Select value={String(pageSize)} onValueChange={(v) => {
        const n = Number(v)
        if (isTicketPageSize(n)) onPageSizeChange(n)
      }}>
        <SelectTrigger id={`${idPrefix}-page-size`} className="h-10 w-[72px] sm:h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TICKET_PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <nav aria-label="Ticket pages" className="@container">
      {/* Wide: shared pagination + page size */}
      <div className="hidden items-center gap-4 @3xl:flex">
        <div className="min-w-0 flex-1">
          {totalPages > 1 ? (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              itemsPerPage={pageSize}
              startIndex={startIndex}
              onPageChange={onPageChange}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="num">{totalCount}</span> result{totalCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {sizeSelect}
      </div>

      {/* Narrow: compact pager */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 @3xl:hidden">
        <p className="text-xs text-muted-foreground">
          <span className="num">
            {from}–{to}
          </span>{" "}
          of <span className="num">{totalCount}</span>
        </p>
        <div className="flex items-center gap-3">
          {sizeSelect}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
                className="sm:size-10"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <span className="num min-w-12 text-center text-xs text-muted-foreground" aria-live="polite">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="sm:size-10"
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
