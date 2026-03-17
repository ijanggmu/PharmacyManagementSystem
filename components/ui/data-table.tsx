"use client"

import { ReactNode } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  isLoading?: boolean
  error?: Error | string | null
  emptyMessage?: string
  searchPlaceholder?: string
  showSearch?: boolean
  onSearch?: (value: string) => void
  searchValue?: string
  // Pagination
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange?: (itemsPerPage: number) => void
  itemsPerPageOptions?: number[]
  // Actions
  actions?: ReactNode
  // Custom empty state
  emptyState?: ReactNode
  // Row click handler
  onRowClick?: (row: T) => void
  // Additional filters
  filters?: ReactNode
  className?: string
  // Serial number column
  showSerialNumber?: boolean
  serialOffset?: number
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading = false,
  error = null,
  emptyMessage = "No data available",
  searchPlaceholder = "Search...",
  showSearch = true,
  onSearch,
  searchValue = "",
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 20, 50, 100],
  actions,
  emptyState,
  onRowClick,
  filters,
  className,
  showSerialNumber = false,
  serialOffset = 0,
}: DataTableProps<T>) {
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page)
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search and Actions Bar */}
      {(showSearch || actions || filters) && (
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between overflow-hidden">
          <div className="flex flex-1 gap-4 items-center w-full sm:w-auto min-w-0">
            {showSearch && onSearch && (
              <div className="relative flex-1 sm:flex-initial sm:w-64 min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => onSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}
            {filters}
          </div>
          {actions && <div className="flex flex-wrap gap-2 w-full sm:w-auto min-w-0 shrink-0">{actions}</div>}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <div className="relative max-h-[calc(100vh-300px)] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {showSerialNumber && <TableHead className="w-12 text-center">SN</TableHead>}
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading data...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-sm font-medium text-destructive">
                      {typeof error === "string" ? error : error?.message || "Failed to load data"}
                    </p>
                    <p className="text-xs text-muted-foreground">Please try again later</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12">
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                >
                  {showSerialNumber && (
                    <TableCell className="w-12 text-center">
                      {serialOffset + rowIndex + 1}
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </div>
      </div>

      {/* Enhanced Pagination */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
          {/* Items per page selector */}
          <div className="flex items-center gap-2">
            {onItemsPerPageChange && (
              <>
                <span className="text-sm text-muted-foreground">Items per page:</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => onItemsPerPageChange(parseInt(value))}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itemsPerPageOptions.map((option) => (
                      <SelectItem key={option} value={option.toString()}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <span className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {endIndex} of {totalItems} results
            </span>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-2">
            {/* First Page */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1 || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            {/* Previous Page */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page Number Input */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Page</span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={handlePageInput}
                className="h-8 w-16 text-center"
                disabled={isLoading}
              />
              <span className="text-sm text-muted-foreground">of {totalPages}</span>
            </div>

            {/* Next Page */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Last Page */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

