"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Phone,
  Mail,
  MapPin,
  Plus,
  Package,
  Upload,
  ScrollText,
  AlertCircle,
  Truck,
  Search,
} from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { useDebounce } from "@/lib/utils/performance"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import EditSupplierModal from "./edit-supplier-modal"
import CreateSupplierModal from "./create-supplier-modal"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import BulkMedicineImportModal from "@/features/medicines/components/bulk-medicine-import-modal"
import SupplierLedgerModal from "./supplier-ledger-modal"
import { SupplierActiveBadge, SupplierDetailSheet, isProfileComplete } from "./supplier-detail-sheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useSuppliers, useDeleteSupplier } from "@/features/suppliers/hooks/use-suppliers"
import { suppliersApi, Supplier, SuppliersFilters } from "@/features/suppliers/api-client"
import { CurrencyDisplay } from "@/components/currency-display"

interface SupplierTableProps {
  filters?: SuppliersFilters
}

type ActiveFilter = NonNullable<SuppliersFilters["active"]>
type ProfileFilter = NonNullable<SuppliersFilters["profile"]>

/** Sort options the .NET endpoint supports (SortBy balance|created|name + SortDir). */
const SORT_OPTIONS = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "balance:desc", label: "Highest payable first" },
  { value: "balance:asc", label: "Lowest payable first" },
  { value: "created:desc", label: "Newest first" },
  { value: "created:asc", label: "Oldest first" },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]["value"]

export default function SupplierTable({ filters }: SupplierTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  // The request waits for typing to pause, so each keystroke does not fetch (and flash the table).
  const debouncedSearch = useDebounce(searchTerm, 300)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all")
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all")
  const [sort, setSort] = useState<SortValue>("name:asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateMedicineOpen, setIsCreateMedicineOpen] = useState(false)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [supplierForLedger, setSupplierForLedger] = useState<Supplier | null>(null)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [selectedSupplierForMedicine, setSelectedSupplierForMedicine] = useState<Supplier | null>(null)

  const [sortBy, sortOrder] = sort.split(":") as [string, "asc" | "desc"]
  const combinedFilters: SuppliersFilters = {
    ...filters,
    search: debouncedSearch.trim() || undefined,
    active: activeFilter,
    profile: profileFilter,
    sortBy,
    sortOrder,
    page: currentPage,
    limit: pageSize,
  }

  const { data: suppliersResponse, isLoading, error, refetch } = useSuppliers(combinedFilters)
  const deleteSupplierMutation = useDeleteSupplier()

  const suppliers = suppliersResponse?.data || []
  const suppliersError = suppliersResponse?.error
  const totalCount = suppliersResponse?.total ?? suppliers.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const filtered = activeFilter !== "all" || profileFilter !== "all"

  const handleConfirmDelete = () => {
    if (!supplierToDelete) return
    const supplier = supplierToDelete
    setSupplierToDelete(null)
    deleteSupplierMutation.mutate(supplier.id)
    if (detailSupplier?.id === supplier.id) setDetailSupplier(null)
  }

  const resetToFirstPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value)
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setActiveFilter("all")
    setProfileFilter("all")
    setSearchTerm("")
    setCurrentPage(1)
  }

  const columns: Column<Supplier>[] = [
    {
      key: "supplier",
      header: "Supplier",
      cell: (supplier) => (
        <div className="min-w-0 max-w-[16rem]">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium" title={supplier.name}>
              {supplier.name}
            </span>
            {!isProfileComplete(supplier) && (
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0 text-warning"
                aria-label="Incomplete profile: missing email, phone or contact person"
              />
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {supplier.tax_id ? <span className="num">PAN {supplier.tax_id}</span> : "No PAN on file"}
            {supplier.contact_person ? ` · ${supplier.contact_person}` : ""}
          </div>
        </div>
      ),
      exportValue: (supplier) => (supplier.tax_id ? `${supplier.name} (PAN ${supplier.tax_id})` : supplier.name),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (supplier) =>
        supplier.email || supplier.phone ? (
          <div className="space-y-1">
            {supplier.phone && (
              <div className="flex items-center gap-1 text-sm">
                <Phone className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="num">{supplier.phone}</span>
              </div>
            )}
            {supplier.email && (
              <div className="flex min-w-0 items-center gap-1 text-sm">
                <Mail className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="max-w-[14rem] truncate" title={supplier.email}>
                  {supplier.email}
                </span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
      exportValue: (supplier) => [supplier.phone, supplier.email].filter(Boolean).join(" / "),
    },
    {
      key: "address",
      header: "Address",
      cell: (supplier) =>
        supplier.address ? (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="max-w-[200px] truncate" title={supplier.address}>
              {supplier.address}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
      exportValue: (supplier) => supplier.address || "",
    },
    {
      key: "status",
      header: "Status",
      cell: (supplier) => <SupplierActiveBadge supplier={supplier} />,
      exportValue: (supplier) => (supplier.is_active === false ? "Inactive" : "Active"),
    },
    {
      key: "payable",
      header: "Payable",
      className: "text-right",
      cell: (supplier) => {
        const payable = Number(supplier.payable_amount ?? 0)
        return (
          <div className={payable > 0 ? "num text-right text-sm font-semibold text-warning" : "num text-right text-sm text-muted-foreground"}>
            <CurrencyDisplay amount={payable} />
          </div>
        )
      },
      exportValue: (supplier) => Number(supplier.payable_amount ?? 0),
    },
    {
      key: "receivable",
      header: "Advance",
      className: "text-right",
      cell: (supplier) => {
        const receivable = Number(supplier.receivable_amount ?? 0)
        return (
          <div className={receivable > 0 ? "num text-right text-sm text-success" : "num text-right text-sm text-muted-foreground"}>
            <CurrencyDisplay amount={receivable} />
          </div>
        )
      },
      exportValue: (supplier) => Number(supplier.receivable_amount ?? 0),
    },
    {
      key: "added",
      header: "Added",
      cell: (supplier) => (
        <div className="num whitespace-nowrap text-sm">
          {new Date(supplier.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      ),
      exportValue: (supplier) => new Date(supplier.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (supplier) => (
        // Keep menu clicks from also opening the details sheet via the row click.
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Actions for ${supplier.name}`}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailSupplier(supplier)}>
                <Eye className="mr-2 h-4 w-4" />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSupplierForLedger(supplier)}>
                <ScrollText className="mr-2 h-4 w-4" />
                Ledger &amp; bills
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedSupplierForMedicine(supplier)
                  setIsCreateMedicineOpen(true)
                }}
              >
                <Package className="mr-2 h-4 w-4" />
                Add medicine
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedSupplierForMedicine(supplier)
                  setIsBulkImportOpen(true)
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk import
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditSupplier(supplier)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit supplier
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={() => setSupplierToDelete(supplier)}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Delete supplier
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={suppliers}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="No suppliers found"
        emptyState={
          error || suppliersError ? (
            <ErrorState
              size="compact"
              title="Couldn't load suppliers"
              message={
                typeof suppliersError === "string"
                  ? suppliersError
                  : error instanceof Error
                    ? error.message
                    : "Check your connection and try again."
              }
              onRetry={() => void refetch()}
            />
          ) : searchTerm || filtered ? (
            <EmptyState
              size="compact"
              icon={Search}
              title={searchTerm ? `No suppliers match "${searchTerm}"` : "No suppliers match these filters"}
              description="Check the spelling, search by a different name or clear the filters."
              action={{ label: "Clear filters", onClick: clearFilters }}
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Truck}
              title="No suppliers yet"
              description="Add your first supplier to start raising purchase orders and tracking what you owe."
              action={{ label: "Add supplier", icon: Plus, onClick: () => setIsCreateModalOpen(true) }}
            />
          )
        }
        searchPlaceholder="Search by name, phone or email…"
        searchValue={searchTerm}
        onSearch={resetToFirstPage(setSearchTerm)}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={pageSize}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={resetToFirstPage(setPageSize)}
        onRowClick={setDetailSupplier}
        showSerialNumber
        serialOffset={(currentPage - 1) * pageSize}
        enableExport
        exportFilename="suppliers"
        exportTitle="Suppliers"
        onExportAll={async () => {
          const res = await suppliersApi.getAllSuppliers(combinedFilters)
          if (res.error) throw new Error(res.error)
          return res.data
        }}
        filters={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={activeFilter} onValueChange={resetToFirstPage((v: string) => setActiveFilter(v as ActiveFilter))}>
              <SelectTrigger className="h-10 w-full sm:w-[150px]" aria-label="Filter by active status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Active &amp; inactive</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={profileFilter} onValueChange={resetToFirstPage((v: string) => setProfileFilter(v as ProfileFilter))}>
              <SelectTrigger className="h-10 w-full sm:w-[170px]" aria-label="Filter by contact profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any profile</SelectItem>
                <SelectItem value="complete">Complete profile</SelectItem>
                <SelectItem value="incomplete">Incomplete profile</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={resetToFirstPage((v: string) => setSort(v as SortValue))}>
              <SelectTrigger className="h-10 w-full sm:w-[190px]" aria-label="Sort suppliers">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        }
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus aria-hidden />
            Add supplier
          </Button>
        }
      />

      {filtered && (
        <div className="flex flex-wrap gap-2" aria-label="Active filters">
          {activeFilter !== "all" && <Badge variant="muted">{activeFilter === "active" ? "Active only" : "Inactive only"}</Badge>}
          {profileFilter !== "all" && (
            <Badge variant="muted">{profileFilter === "complete" ? "Complete profile" : "Incomplete profile"}</Badge>
          )}
        </div>
      )}

      <SupplierDetailSheet
        supplier={detailSupplier}
        onOpenChange={(open) => !open && setDetailSupplier(null)}
        onEdit={setEditSupplier}
        onOpenLedger={setSupplierForLedger}
      />

      <EditSupplierModal
        supplier={editSupplier}
        isOpen={!!editSupplier}
        onClose={() => setEditSupplier(null)}
        onUpdate={() => void refetch()}
      />

      <CreateSupplierModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={() => void refetch()} />

      <SupplierLedgerModal supplier={supplierForLedger} isOpen={!!supplierForLedger} onClose={() => setSupplierForLedger(null)} />

      <CreateMedicineModal
        isOpen={isCreateMedicineOpen}
        onClose={() => {
          setIsCreateMedicineOpen(false)
          setSelectedSupplierForMedicine(null)
        }}
        onCreate={() => {
          setIsCreateMedicineOpen(false)
          setSelectedSupplierForMedicine(null)
          void refetch()
        }}
        initialSupplierId={selectedSupplierForMedicine?.id}
      />

      <BulkMedicineImportModal
        isOpen={isBulkImportOpen}
        onClose={() => {
          setIsBulkImportOpen(false)
          setSelectedSupplierForMedicine(null)
        }}
        onSuccess={() => {
          setIsBulkImportOpen(false)
          setSelectedSupplierForMedicine(null)
          void refetch()
        }}
        initialSupplierName={selectedSupplierForMedicine?.name}
      />

      <ConfirmDialog
        isOpen={!!supplierToDelete}
        onClose={() => setSupplierToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete supplier?"
        description={`${supplierToDelete?.name ?? "This supplier"} will be permanently deleted. This can't be undone.`}
        confirmText="Delete supplier"
      />
    </div>
  )
}
