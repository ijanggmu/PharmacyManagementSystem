"use client"

import React, { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Filter,
  AlertTriangle,
  Clock,
  Package,
  Plus,
  Upload,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { HighlightMatch } from "./highlight-match"
import { DataTable, Column } from "@/components/ui/data-table"
import MedicineDetailModal from "./medicine-detail-modal"
import EditMedicineModal from "./edit-medicine-modal"
import CreateMedicineModal from "./create-medicine-modal"
import BulkMedicineImportModal from "./bulk-medicine-import-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { Medicine } from "@/features/medicines/api-client"
import { useMedicines, useDeleteMedicine, useUnarchiveMedicine, medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { medicinesApi, MedicinesFilters } from "@/features/medicines/api-client"
import { MultiSelect } from "@/components/ui/multi-select"
import { useQueryClient } from "@tanstack/react-query"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut"
import { useDebounce } from "@/lib/utils/performance"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SupplierCombobox } from "@/features/suppliers/components/supplier-combobox"
import { useSupplierOptions } from "@/features/suppliers/hooks/use-supplier-options"

interface InventoryTableProps {
  filters?: MedicinesFilters
  /** Name of the branch the "branch stock" figure refers to (the selected branch or the user's own). */
  branchStockLabel?: string
  openCreateModal?: boolean
  onCreateModalClose?: () => void
}

const STOCK_OPTIONS = [
  { value: "in" as const, label: "In stock" },
  { value: "low" as const, label: "Low stock" },
  { value: "out" as const, label: "Out of stock" },
]
const EXPIRY_OPTIONS = [
  { value: "expiring" as const, label: "Expiring soon" },
  { value: "expired" as const, label: "Expired" },
]
/** "field:order" pairs the .NET list endpoint accepts (sortBy + sortOrder). */
const SORT_OPTIONS = [
  { value: "name:asc", label: "Name (A–Z)" },
  { value: "name:desc", label: "Name (Z–A)" },
  { value: "quantity:asc", label: "Stock (lowest first)" },
  { value: "quantity:desc", label: "Stock (highest first)" },
  { value: "expiry:asc", label: "Expiry (soonest first)" },
  { value: "expiry:desc", label: "Expiry (latest first)" },
  { value: "price:asc", label: "Price (low to high)" },
  { value: "price:desc", label: "Price (high to low)" },
  { value: "updated:desc", label: "Recently updated" },
] as const
type SortValue = (typeof SORT_OPTIONS)[number]["value"]
const DEFAULT_SORT: SortValue = "name:asc"
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const SEARCH_DEBOUNCE_MS = 300

export default function EnhancedInventoryTable({ filters, branchStockLabel, openCreateModal = false, onCreateModalClose }: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  // The input updates on every keystroke; the server query waits until typing pauses.
  const debouncedSearch = useDebounce(searchTerm.trim(), SEARCH_DEBOUNCE_MS)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [supplierId, setSupplierId] = useState("")
  const [supplierSearch, setSupplierSearch] = useState("")
  const [stockStatuses, setStockStatuses] = useState<("in" | "low" | "out")[]>([])
  const [expiryStatuses, setExpiryStatuses] = useState<("expiring" | "expired")[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [belowReorder, setBelowReorder] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [sort, setSort] = useState<SortValue>(DEFAULT_SORT)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(PAGE_SIZE_OPTIONS[0])
  const supplierOptions = useSupplierOptions({ search: supplierSearch, includeInactive: true })

  const [sortBy, sortOrder] = sort.split(":") as [string, "asc" | "desc"]

  // Combine local filters with props filters (multi-select takes precedence). Every field here is
  // part of the TanStack Query key (medicineKeys.list), so any change refetches.
  const combinedFilters: MedicinesFilters = {
    ...filters,
    search: debouncedSearch || undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    supplierId: supplierId || undefined,
    stockStatuses: stockStatuses.length > 0 ? stockStatuses : undefined,
    expiryStatuses: expiryStatuses.length > 0 ? expiryStatuses : undefined,
    includeArchived: showArchived || undefined,
    belowReorderLevel: belowReorder || undefined,
    sortBy,
    sortOrder,
    page: currentPage,
    limit: itemsPerPage,
  }

  // Use TanStack Query to fetch medicines
  const queryClient = useQueryClient()
  const { data: medicinesResponse, isLoading, isFetching, error } = useMedicines(combinedFilters)
  const deleteMedicineMutation = useDeleteMedicine()
  const unarchiveMedicineMutation = useUnarchiveMedicine()

  const medicines = medicinesResponse?.data || []
  const medicinesError = medicinesResponse?.error
  const totalCount = medicinesResponse?.total ?? medicines.length

  // Calculate total pages using the total count from API
  const totalPages = Math.ceil(totalCount / itemsPerPage)

  // Listen for filter events from the stats cards
  React.useEffect(() => {
    const handleFilterEvent = (event: CustomEvent) => {
      const { filter } = event.detail
      switch (filter) {
        case 'low-stock':
          // The "Low stock" card counts everything at or below the reorder level, zero included,
          // so the table must show both buckets or its total disagrees with the card.
          setStockStatuses(['low', 'out'])
          setExpiryStatuses([])
          break
        case 'expiring-soon':
          setExpiryStatuses(['expiring'])
          setStockStatuses([])
          break
        case 'expired':
          setExpiryStatuses(['expired'])
          setStockStatuses([])
          break
        case 'reset':
          setSearchTerm("")
          setCategoryIds([])
          setSupplierId("")
          setStockStatuses([])
          setExpiryStatuses([])
          setBelowReorder(false)
          break
        default:
          setStockStatuses([])
          setExpiryStatuses([])
      }
      setCurrentPage(1)
    }

    window.addEventListener('inventory-filter', handleFilterEvent as EventListener)
    return () => {
      window.removeEventListener('inventory-filter', handleFilterEvent as EventListener)
    }
  }, [])

  // Use medicines directly since API handles pagination
  const paginatedMedicines = medicines

  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(openCreateModal)
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false)
  const [categoryList, setCategoryList] = useState<Array<{ id: string; name: string }>>([])
  const { toast } = useToast()

  // Ctrl/Cmd+Shift+M opens Add Medicine from anywhere on this page (see keyboard-shortcuts-dialog.tsx)
  useKeyboardShortcut("m", () => setIsCreateModalOpen(true), [], { shift: true })

  // "/" jumps to the medicine search, unless the user is already typing somewhere.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return
      if (document.querySelector("[role=dialog]")) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Fetch categories from database
  React.useEffect(() => {
    const fetchCategories = async () => {
      const result = await categoriesApi.getCategories()
      if (!result.error) setCategoryList(result.data || [])
    }
    fetchCategories()
  }, [])

  // Listen for refresh events
  React.useEffect(() => {
    const handleRefresh = () => {
      handleUpdate()
    }

    window.addEventListener("refresh-medicines", handleRefresh)
    window.addEventListener("refresh-data", handleRefresh)

    return () => {
      window.removeEventListener("refresh-medicines", handleRefresh)
      window.removeEventListener("refresh-data", handleRefresh)
    }
  }, [])

  // Handle external modal open trigger
 React.useEffect(() => {
    if (openCreateModal) {
      setIsCreateModalOpen(true)
    }
  }, [openCreateModal])

  const activeFiltersCount = React.useMemo(() => {
    const filterCount =
      categoryIds.length + stockStatuses.length + expiryStatuses.length + (supplierId ? 1 : 0) + (belowReorder ? 1 : 0)
    const searchCount = searchTerm.trim() ? 1 : 0
    return filterCount + searchCount
  }, [categoryIds, stockStatuses, expiryStatuses, supplierId, belowReorder, searchTerm])

  const resetFilters = () => {
    setSearchTerm("")
    setCategoryIds([])
    setSupplierId("")
    setShowArchived(false)
    setBelowReorder(false)
    setStockStatuses([])
    setExpiryStatuses([])
    setCurrentPage(1)
  }

  /** Removable chips for the filters that are on (search has its own clear button). */
  const filterChips: { key: string; label: string; onRemove: () => void }[] = [
    ...categoryIds.map((id) => ({
      key: `cat-${id}`,
      label: categoryList.find((c) => c.id === id)?.name ?? "Category",
      onRemove: () => setCategoryIds((v) => v.filter((x) => x !== id)),
    })),
    ...(supplierId
      ? [
          {
            key: "supplier",
            label: supplierOptions.knownOptions.find((o) => o.id === supplierId)?.name ?? "Supplier",
            onRemove: () => setSupplierId(""),
          },
        ]
      : []),
    ...stockStatuses.map((v) => ({
      key: `stock-${v}`,
      label: STOCK_OPTIONS.find((o) => o.value === v)?.label ?? v,
      onRemove: () => setStockStatuses((list) => list.filter((x) => x !== v)),
    })),
    ...expiryStatuses.map((v) => ({
      key: `exp-${v}`,
      label: EXPIRY_OPTIONS.find((o) => o.value === v)?.label ?? v,
      onRemove: () => setExpiryStatuses((list) => list.filter((x) => x !== v)),
    })),
    ...(belowReorder ? [{ key: "reorder", label: "At or below reorder level", onRemove: () => setBelowReorder(false) }] : []),
    ...(showArchived ? [{ key: "archived", label: "Including archived", onRemove: () => setShowArchived(false) }] : []),
  ]

  const getStockStatus = (current: number, minimum: number) => {
    if (current === 0)
      return {
        label: "Out of stock",
        variant: "danger" as const,
        icon: <AlertTriangle className="h-3 w-3" aria-hidden />,
      }
    if (current <= minimum)
      return {
        label: "Low stock",
        variant: "warning" as const,
        icon: <Package className="h-3 w-3" aria-hidden />,
      }
    return {
      label: "In stock",
      variant: "success" as const,
      icon: <Package className="h-3 w-3" aria-hidden />,
    }
  }

  // Prefer the real per-batch nearest expiry once batches exist — the static
  // medicines.expiry_date is set once at creation and never kept in sync, so it
  // goes stale the moment a medicine has more than one batch with a different
  // expiry. Falls back to the legacy field for pre-batch-tracking stock.
  const effectiveExpiry = (medicine: Medicine): string | null =>
    (medicine.batch_count ?? 0) > 0 ? medicine.batch_nearest_expiry ?? null : medicine.expiry_date

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null

    const expiry = new Date(expiryDate)
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    if (expiry < now) {
      return {
        label: "Expired",
        variant: "danger" as const,
        icon: <AlertTriangle className="h-3 w-3" aria-hidden />,
      }
    } else if (expiry <= thirtyDaysFromNow) {
      return {
        label: "Expiring soon",
        variant: "warning" as const,
        icon: <Clock className="h-3 w-3" aria-hidden />,
      }
    }
    return null
  }

  const handleViewDetails = (medicine: Medicine) => {
    setSelectedMedicine(medicine)
    setIsDetailModalOpen(true)
  }

  const handleEdit = (medicine: Medicine) => {
    setSelectedMedicine(medicine)
    setIsEditModalOpen(true)
  }

  const handleDeleteClick = (medicine: Medicine) => {
    setMedicineToDelete(medicine)
    setIsDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!medicineToDelete) return

    // Store the ID before clearing state
    const medicineId = medicineToDelete.id

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setMedicineToDelete(null)

    try {
      // Execute the delete mutation
      deleteMedicineMutation.mutate(medicineId)
    } catch (error) {
      // Fallback error handling
      console.error("Delete operation failed:", error)
    }
  }

  const handleUpdate = () => {
    // Invalidate all medicine queries to trigger refetch
    queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
    queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Medicine>[] = [
    {
      key: "medicineDetails",
      header: "Medicine",
      cell: (medicine) => {
        return (
          <div className="space-y-1">
            <div className="max-w-[260px] truncate font-medium text-foreground" title={medicine.name}>
              <HighlightMatch text={medicine.name} query={debouncedSearch} />
            </div>
            <div className="text-sm text-muted-foreground">
              {[medicine.strength, medicine.form].filter(Boolean).join(" · ") || "—"}
              {medicine.generic_name && (
                <span className="ml-2 text-primary">
                  (<HighlightMatch text={medicine.generic_name} query={debouncedSearch} />)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {medicine.is_active === false && (
                <Badge variant="muted" className="text-xs">
                  Archived
                </Badge>
              )}
              {medicine.prescription_required && (
                <Badge variant="info" className="text-xs">
                  Prescription required
                </Badge>
              )}
            </div>
          </div>
        )
      },
      exportValue: (medicine) => `${medicine.name} ${medicine.strength ?? ""} ${medicine.form ?? ""}`.trim(),
    },
    {
      key: "category",
      header: "Category",
      cell: (medicine) => (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          {medicine.categories?.name || "Uncategorized"}
        </Badge>
      ),
      exportValue: (medicine) => medicine.categories?.name || "Uncategorized",
    },
    {
      key: "stockStatus",
      header: "Stock",
      cell: (medicine) => {
        const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
        const hasBranchFigure = medicine.branch_stock_quantity != null
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="num text-lg font-medium">
                {hasBranchFigure ? medicine.branch_stock_quantity : medicine.stock_quantity}
              </span>
              <span className="text-sm text-muted-foreground">units</span>
              {hasBranchFigure && <span className="text-xs text-muted-foreground">at {branchStockLabel ?? "this branch"}</span>}
            </div>
            {hasBranchFigure && (
              <div className="text-xs text-muted-foreground">
                All branches: <span className="num">{medicine.stock_quantity}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Reorder at <span className="num">{medicine.minimum_stock}</span>
            </div>
            <Badge variant={stockStatus.variant} className="flex items-center gap-1 w-fit">
              {stockStatus.icon}
              {stockStatus.label}
            </Badge>
          </div>
        )
      },
      exportValue: (medicine) => {
        const hasBranchFigure = medicine.branch_stock_quantity != null
        return hasBranchFigure ? medicine.branch_stock_quantity! : medicine.stock_quantity
      },
    },
    {
      key: "price",
      header: "Price",
      className: "text-right",
      cell: (medicine) => (
        <div className="text-right">
          <div className="num text-lg font-semibold text-foreground">
            <CurrencyDisplay amount={medicine.unit_price} />
          </div>
          <div className="text-xs text-muted-foreground">per unit</div>
        </div>
      ),
      exportValue: (medicine) => medicine.unit_price,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (medicine) => <div className="num whitespace-nowrap text-sm text-muted-foreground">{new Date(medicine.created_at).toLocaleDateString()}</div>,
      exportValue: (medicine) => new Date(medicine.created_at).toLocaleDateString(),
    },
    {
      key: "expiryDate",
      header: "Expiry",
      cell: (medicine) => {
        const expiry = effectiveExpiry(medicine)
        const expiryStatus = getExpiryStatus(expiry)
        const batchCount = medicine.batch_count ?? 0
        return (
          <div className="space-y-1">
            <div className="num whitespace-nowrap text-sm">
              {expiry ? new Date(expiry).toLocaleDateString() : <span className="text-muted-foreground">No expiry date</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {expiryStatus && (
                <Badge variant={expiryStatus.variant} className="flex items-center gap-1 w-fit">
                  {expiryStatus.icon}
                  {expiryStatus.label}
                </Badge>
              )}
              {batchCount > 1 && (
                <Badge variant="outline" className="text-[10px]" title="This medicine has more than one batch — open details for the full breakdown">
                  ×{batchCount} batches
                </Badge>
              )}
            </div>
          </div>
        )
      },
      exportValue: (medicine) => {
        const expiry = effectiveExpiry(medicine)
        return expiry ? new Date(expiry).toLocaleDateString() : ""
      },
    },
    {
      key: "rackLocation",
      header: "Shelf",
      cell: (medicine) => {
        const racks = medicine.batch_rack_locations ?? []
        if (racks.length === 0) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {racks.map((r) => (
              <Badge key={r} variant="outline" className="text-xs font-normal">
                {r}
              </Badge>
            ))}
          </div>
        )
      },
      exportValue: (medicine) => (medicine.batch_rack_locations ?? []).join(", "),
    },
    {
      key: "status",
      header: "Status",
      cell: (medicine) => {
        const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
        const expiryStatus = getExpiryStatus(effectiveExpiry(medicine))
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={stockStatus.variant} className="flex items-center gap-1">
              {stockStatus.icon}
              {stockStatus.label}
            </Badge>
            {expiryStatus && (
              <Badge variant={expiryStatus.variant} className="flex items-center gap-1">
                {expiryStatus.icon}
                {expiryStatus.label}
              </Badge>
            )}
          </div>
        )
      },
      exportValue: (medicine) => getStockStatus(medicine.stock_quantity, medicine.minimum_stock).label,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (medicine) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label={`Actions for ${medicine.name}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => handleViewDetails(medicine)}>
              <Eye className="h-4 w-4 mr-2" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEdit(medicine)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit medicine
            </DropdownMenuItem>
            {medicine.is_active === false ? (
              <DropdownMenuItem onClick={() => unarchiveMedicineMutation.mutate(medicine.id)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteClick(medicine)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]


  return (
    <div className="space-y-6">
      {/* Enhanced Table */}
      <DataTable
        data={paginatedMedicines}
        columns={columns}
        isLoading={isLoading}
        error={error || medicinesError}
        emptyMessage="No medicines found"
        emptyState={
          activeFiltersCount > 0 || showArchived ? (
            <EmptyState
              size="compact"
              icon={Filter}
              title="No medicines match these filters"
              description="Try a different search term, or clear the filters to see your full inventory."
              action={{ label: "Clear filters", onClick: resetFilters, icon: RotateCcw }}
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Package}
              title="No medicines yet"
              description="Add your first medicine, or import your existing stock list in bulk from a CSV file."
              action={{ label: "Add medicine", onClick: () => setIsCreateModalOpen(true), icon: Plus }}
              secondaryAction={{ label: "Bulk import", onClick: () => setIsBulkImportModalOpen(true), icon: Upload }}
            />
          )
        }
        showSearch={false}
        onRowClick={handleViewDetails}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={(size) => {
          setItemsPerPage(size)
          setCurrentPage(1)
        }}
        itemsPerPageOptions={PAGE_SIZE_OPTIONS}
        showSerialNumber
        serialOffset={(currentPage - 1) * itemsPerPage}
        filters={
          <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && searchTerm) {
                    e.preventDefault()
                    handleSearch("")
                  }
                }}
                placeholder="Search name, generic, brand or barcode"
                aria-label="Search medicines by name, generic name, brand or barcode"
                aria-describedby="medicine-search-status"
                className="h-10 pl-9 pr-12"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => {
                    handleSearch("")
                    searchInputRef.current?.focus()
                  }}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <kbd
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground sm:inline-block"
                >
                  /
                </kbd>
              )}
            </div>
            <p id="medicine-search-status" className="text-xs text-muted-foreground" aria-live="polite">
              {isLoading || (isFetching && searchTerm.trim() !== debouncedSearch)
                ? "Searching…"
                : `${totalCount.toLocaleString()} ${totalCount === 1 ? "medicine" : "medicines"}${debouncedSearch ? ` match "${debouncedSearch}"` : ""}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <MultiSelect
              options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
              value={categoryIds}
              onValueChange={(v) => {
                setCategoryIds(v)
                setCurrentPage(1)
              }}
              placeholder="All categories"
              className="h-10 w-[180px]"
              allLabel="All categories"
              showAllOption={true}
            />
            <SupplierCombobox
              suppliers={supplierOptions.options}
              value={supplierId}
              onValueChange={(v) => {
                setSupplierId(v)
                setCurrentPage(1)
              }}
              onSearchChange={setSupplierSearch}
              isSearching={supplierOptions.isSearching}
              isLoading={supplierOptions.isLoading}
              error={supplierOptions.error}
              onRetry={supplierOptions.refetch}
              selectedLabel={supplierOptions.knownOptions.find((s) => s.id === supplierId)?.name}
              placeholder="All suppliers"
              aria-label="Filter by supplier"
              className="h-10 w-[180px]"
            />
            <MultiSelect
              options={STOCK_OPTIONS}
              value={stockStatuses}
              onValueChange={(v) => {
                setStockStatuses(v as ("in" | "low" | "out")[])
                setCurrentPage(1)
              }}
              placeholder="All stock levels"
              className="h-10 w-[160px]"
              allLabel="All stock levels"
              showAllOption={true}
            />
            <MultiSelect
              options={EXPIRY_OPTIONS}
              value={expiryStatuses}
              onValueChange={(v) => {
                setExpiryStatuses(v as ("expiring" | "expired")[])
                setCurrentPage(1)
              }}
              placeholder="All expiry"
              className="h-10 w-[160px]"
              allLabel="All expiry"
              showAllOption={true}
            />
            <Button
              type="button"
              variant={belowReorder ? "secondary" : "outline"}
              size="sm"
              className="h-10"
              aria-pressed={belowReorder}
              onClick={() => {
                setBelowReorder((v) => !v)
                setCurrentPage(1)
              }}
            >
              Needs reorder
            </Button>
            <Button
              type="button"
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              className="h-10"
              aria-pressed={showArchived}
              onClick={() => {
                setShowArchived((v) => !v)
                setCurrentPage(1)
              }}
            >
              {showArchived ? "Showing archived" : "Show archived"}
            </Button>
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as SortValue)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-[190px]" aria-label="Sort medicines">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
              {filterChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-xs">
                  <span className="font-medium">{chip.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      chip.onRemove()
                      setCurrentPage(1)
                    }}
                    aria-label={`Remove filter ${chip.label}`}
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={resetFilters}>
                Clear all
              </Button>
            </div>
          )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shrink-0" aria-label="Add medicine">
                  <Plus className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Add medicine</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add one medicine
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsBulkImportModalOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk import from CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        enableExport
        exportFilename="inventory"
        exportTitle="Inventory"
        onExportAll={async () => {
          const { data } = await medicinesApi.getMedicines({ ...combinedFilters, page: 1, limit: 100000 })
          return data ?? []
        }}
      />

      <MedicineDetailModal
        medicine={selectedMedicine}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      {selectedMedicine && (
        <EditMedicineModal
          medicine={selectedMedicine}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onUpdate={handleUpdate}
        />
      )}

      <CreateMedicineModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          onCreateModalClose?.()
        }}
        onCreate={handleUpdate}
      />

      <BulkMedicineImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        onSuccess={handleUpdate}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setMedicineToDelete(null)
        }}
        onConfirm={handleDelete}
        title="Delete medicine?"
        description={`"${medicineToDelete?.name}" will be removed from your inventory. This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
