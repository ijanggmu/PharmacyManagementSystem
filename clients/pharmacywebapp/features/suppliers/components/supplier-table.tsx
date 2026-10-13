"use client"

import { useState } from "react"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
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
  Ban,
  CheckCircle2,
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
import { useSuppliers, useDeleteSupplier, useUpdateSupplier } from "@/features/suppliers/hooks/use-suppliers"
import { suppliersApi, Supplier, SuppliersFilters } from "@/features/suppliers/api-client"
import { CurrencyDisplay } from "@/components/currency-display"

interface SupplierTableProps {
  filters?: SuppliersFilters
}

type ActiveFilter = NonNullable<SuppliersFilters["active"]>
type ProfileFilter = NonNullable<SuppliersFilters["profile"]>

/** Sort options the .NET endpoint supports (SortBy balance|created|name + SortDir). */
const SORT_OPTIONS = [
  { value: "name:asc", labelKey: "nameAsc" },
  { value: "name:desc", labelKey: "nameDesc" },
  { value: "balance:desc", labelKey: "balanceDesc" },
  { value: "balance:asc", labelKey: "balanceAsc" },
  { value: "created:desc", labelKey: "createdDesc" },
  { value: "created:asc", labelKey: "createdAsc" },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]["value"]

/** Why the supplier can't be deleted (a suppliers.delete.* key), from what the row already shows; null when only the server can tell. */
function supplierDeleteBlocker(supplier: Supplier): "blockerPayable" | "blockerAdvance" | null {
  const payable = Number(supplier.payable_amount ?? 0)
  const advance = Number(supplier.receivable_amount ?? 0)
  if (payable !== 0) return "blockerPayable"
  if (advance !== 0) return "blockerAdvance"
  return null
}

export default function SupplierTable({ filters }: SupplierTableProps) {
  const t = useTranslations("suppliers")
  const { formatBsDate } = useI18n()
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
  /** Edit was opened from the details panel: Back / Save return there instead of closing. */
  const [editFromDetail, setEditFromDetail] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateMedicineOpen, setIsCreateMedicineOpen] = useState(false)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [supplierForLedger, setSupplierForLedger] = useState<Supplier | null>(null)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  /** Delete was refused because the supplier has history: offer to deactivate it instead. */
  const [supplierInUse, setSupplierInUse] = useState<{ supplier: Supplier; reason: string } | null>(null)
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
  const updateSupplierMutation = useUpdateSupplier()

  const suppliers = suppliersResponse?.data || []
  const suppliersError = suppliersResponse?.error
  const totalCount = suppliersResponse?.total ?? suppliers.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const filtered = activeFilter !== "all" || profileFilter !== "all"

  /**
   * Client-side guard before the confirm: a supplier with an open balance has posted bills or payments, so the
   * server would refuse (409) anyway. Offer Mark inactive straight away; the server still checks everything else.
   */
  const requestDelete = (supplier: Supplier) => {
    const reason = supplierDeleteBlocker(supplier)
    if (reason) setSupplierInUse({ supplier, reason: t(`delete.${reason}`) })
    else setSupplierToDelete(supplier)
  }

  const handleConfirmDelete = () => {
    if (!supplierToDelete) return
    const supplier = supplierToDelete
    setSupplierToDelete(null)
    deleteSupplierMutation.mutate(supplier.id, {
      onSuccess: (result) => {
        if (result.inUse) {
          setSupplierInUse({ supplier, reason: result.error ?? "" })
          return
        }
        if (!result.error && detailSupplier?.id === supplier.id) setDetailSupplier(null)
      },
    })
  }

  const setActive = (supplier: Supplier, isActive: boolean) =>
    updateSupplierMutation.mutate({ id: supplier.id, updates: { is_active: isActive } })

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
      header: t("table.supplier"),
      cell: (supplier) => (
        <div className="min-w-0 max-w-[16rem]">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium" title={supplier.name}>
              {supplier.name}
            </span>
            {!isProfileComplete(supplier) && (
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0 text-warning"
                aria-label={t("table.incompleteProfileAria")}
              />
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {supplier.tax_id ? <span className="num">{t("table.pan", { pan: supplier.tax_id })}</span> : t("table.noPan")}
            {supplier.contact_person ? ` · ${supplier.contact_person}` : ""}
          </div>
        </div>
      ),
      exportValue: (supplier) => (supplier.tax_id ? `${supplier.name} (PAN ${supplier.tax_id})` : supplier.name),
    },
    {
      key: "contact",
      header: t("table.contact"),
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
      header: t("table.address"),
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
      header: t("table.status"),
      cell: (supplier) => <SupplierActiveBadge supplier={supplier} />,
      exportValue: (supplier) => (supplier.is_active === false ? t("table.inactive") : t("table.active")),
    },
    {
      key: "payable",
      header: t("table.payable"),
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
      header: t("table.advance"),
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
      header: t("table.added"),
      cell: (supplier) => (
        <div className="num whitespace-nowrap text-sm">
          {formatBsDate(supplier.created_at)}
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
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t("table.actionsFor", { name: supplier.name })}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailSupplier(supplier)}>
                <Eye className="mr-2 h-4 w-4" />
                {t("table.viewDetails")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSupplierForLedger(supplier)}>
                <ScrollText className="mr-2 h-4 w-4" />
                {t("table.ledgerBills")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedSupplierForMedicine(supplier)
                  setIsCreateMedicineOpen(true)
                }}
              >
                <Package className="mr-2 h-4 w-4" />
                {t("table.addMedicine")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedSupplierForMedicine(supplier)
                  setIsBulkImportOpen(true)
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                {t("table.bulkImport")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setEditFromDetail(false)
                  setEditSupplier(supplier)
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                {t("table.editSupplier")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActive(supplier, supplier.is_active === false)}>
                {supplier.is_active === false ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t("table.reactivate")}
                  </>
                ) : (
                  <>
                    <Ban className="mr-2 h-4 w-4" />
                    {t("table.markInactive")}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={() => requestDelete(supplier)}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                {t("table.deleteSupplier")}
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
        emptyMessage={t("empty.notFound")}
        emptyState={
          error || suppliersError ? (
            <ErrorState
              size="compact"
              title={t("empty.loadError")}
              message={
                typeof suppliersError === "string"
                  ? suppliersError
                  : error instanceof Error
                    ? error.message
                    : t("empty.checkConnection")
              }
              onRetry={() => void refetch()}
            />
          ) : searchTerm || filtered ? (
            <EmptyState
              size="compact"
              icon={Search}
              title={searchTerm ? t("empty.noMatchSearch", { search: searchTerm }) : t("empty.noMatchFilters")}
              description={t("empty.noMatchDescription")}
              action={{ label: t("empty.clearFilters"), onClick: clearFilters }}
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Truck}
              title={t("empty.noneTitle")}
              description={t("empty.noneDescription")}
              action={{ label: t("table.addSupplier"), icon: Plus, onClick: () => setIsCreateModalOpen(true) }}
            />
          )
        }
        searchPlaceholder={t("table.searchPlaceholder")}
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
        exportTitle={t("title")}
        onExportAll={async () => {
          const res = await suppliersApi.getAllSuppliers(combinedFilters)
          if (res.error) throw new Error(res.error)
          return res.data
        }}
        filters={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={activeFilter} onValueChange={resetToFirstPage((v: string) => setActiveFilter(v as ActiveFilter))}>
              <SelectTrigger className="h-10 w-full sm:w-[150px]" aria-label={t("table.filterActive")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("table.activeAndInactive")}</SelectItem>
                <SelectItem value="active">{t("table.activeOnly")}</SelectItem>
                <SelectItem value="inactive">{t("table.inactiveOnly")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={profileFilter} onValueChange={resetToFirstPage((v: string) => setProfileFilter(v as ProfileFilter))}>
              <SelectTrigger className="h-10 w-full sm:w-[170px]" aria-label={t("table.filterProfile")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("table.anyProfile")}</SelectItem>
                <SelectItem value="complete">{t("table.completeProfile")}</SelectItem>
                <SelectItem value="incomplete">{t("table.incompleteProfile")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={resetToFirstPage((v: string) => setSort(v as SortValue))}>
              <SelectTrigger className="h-10 w-full sm:w-[190px]" aria-label={t("table.sortLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(`sort.${option.labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t("table.clear")}
              </Button>
            )}
          </div>
        }
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus aria-hidden />
            {t("table.addSupplier")}
          </Button>
        }
      />

      {filtered && (
        <div className="flex flex-wrap gap-2" aria-label={t("table.activeFilters")}>
          {activeFilter !== "all" && <Badge variant="muted">{activeFilter === "active" ? t("table.activeOnly") : t("table.inactiveOnly")}</Badge>}
          {profileFilter !== "all" && (
            <Badge variant="muted">{profileFilter === "complete" ? t("table.completeProfile") : t("table.incompleteProfile")}</Badge>
          )}
        </div>
      )}

      <SupplierDetailSheet
        supplier={detailSupplier}
        onOpenChange={(open) => !open && setDetailSupplier(null)}
        onEdit={(supplier) => {
          // Swap the details panel for the edit form in the same right-side slot.
          setEditFromDetail(true)
          setEditSupplier(supplier)
          setDetailSupplier(null)
        }}
        onOpenLedger={setSupplierForLedger}
        onDelete={requestDelete}
      />

      <EditSupplierModal
        supplier={editSupplier}
        isOpen={!!editSupplier}
        onClose={() => setEditSupplier(null)}
        onUpdate={() => void refetch()}
        onBack={
          editFromDetail
            ? () => {
                setDetailSupplier(editSupplier)
                setEditSupplier(null)
              }
            : undefined
        }
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
        title={t("delete.title")}
        description={t("delete.description", { name: supplierToDelete?.name ?? t("delete.thisSupplier") })}
        confirmText={t("delete.confirm")}
      />

      <ConfirmDialog
        isOpen={!!supplierInUse}
        onClose={() => setSupplierInUse(null)}
        onConfirm={() => {
          const target = supplierInUse
          setSupplierInUse(null)
          if (target) setActive(target.supplier, false)
        }}
        title={t("delete.inUseTitle", { name: supplierInUse?.supplier.name ?? t("delete.thisSupplier") })}
        description={t("delete.inUseDescription", { reason: supplierInUse?.reason || t("delete.inUseDefaultReason") })}
        confirmText={t("delete.markInactive")}
        cancelText={t("delete.keepActive")}
        variant="default"
      />
    </div>
  )
}
