"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelect } from "@/components/ui/multi-select"
import { MoreHorizontal, Eye, CheckCircle2, CircleDashed, XCircle, Plus, Trash2, FileText } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { useDebounce } from "@/lib/utils/performance"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import {
  usePrescription,
  usePrescriptions,
  useDeletePrescription,
  useUpdatePrescriptionStatus,
  PrescriptionsFilters,
} from "@/features/prescriptions/hooks/use-prescriptions"
import { prescriptionsApi, Prescription } from "@/features/prescriptions/api-client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import PrescriptionDetailModal from "./prescription-detail-modal"
import { getPrescriptionStatus } from "./prescription-status"
import CreatePrescriptionModal from "./create-prescription-modal"

interface PrescriptionTableProps {
  filters?: PrescriptionsFilters
  /** Opens the detail view for this prescription id (e.g. from the refills-due card). */
  focusPrescriptionId?: string | null
  onFocusHandled?: () => void
}

const ITEMS_PER_PAGE = 10

export default function PrescriptionTable({ filters, focusPrescriptionId, onFocusHandled }: PrescriptionTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  // The request waits for typing to pause, so each keystroke does not fetch (and flash the table).
  const debouncedSearch = useDebounce(searchTerm, 300)
  const [statuses, setStatuses] = useState<Prescription['status'][]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [prescriptionToDelete, setPrescriptionToDelete] = useState<Prescription | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Prescription | null>(null)

  // Combine local filters with props filters
  const combinedFilters: PrescriptionsFilters = {
    ...filters,
    search: debouncedSearch.trim() || undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch prescriptions
  const { data: prescriptionsResponse, isLoading, isFetching, error, refetch } = usePrescriptions(combinedFilters)
  const deletePrescriptionMutation = useDeletePrescription()
  const updateStatusMutation = useUpdatePrescriptionStatus()

  // Detail view requested from outside the table (refills-due card).
  const { data: focusedResponse } = usePrescription(focusPrescriptionId ?? "")
  useEffect(() => {
    const focused = focusedResponse?.data?.[0]
    if (!focusPrescriptionId || !focused || focused.id !== focusPrescriptionId) return
    setSelectedPrescription(focused)
    setIsDetailModalOpen(true)
    onFocusHandled?.()
  }, [focusedResponse, focusPrescriptionId, onFocusHandled])

  const prescriptions = prescriptionsResponse?.data || []
  const prescriptionsError = prescriptionsResponse?.error
  const totalCount = prescriptionsResponse?.total ?? prescriptions.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const getStatusBadge = (status: Prescription['status']) => getPrescriptionStatus(status)

  const getTotalItems = (items: Prescription['prescription_items']) => {
    return items.reduce((sum, item) => sum + item.quantity_prescribed, 0)
  }

  const getDispensedItems = (items: Prescription['prescription_items']) => {
    return items.reduce((sum, item) => sum + item.quantity_dispensed, 0)
  }

  const handleViewDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription)
    setIsDetailModalOpen(true)
  }

  const handleStatusChange = async (prescription: Prescription, newStatus: Prescription['status']) => {
    try {
      await updateStatusMutation.mutateAsync({ id: prescription.id, status: newStatus })
    } catch (error) {
      console.error("Failed to update prescription status:", error)
    }
  }

  const handleDeleteClick = (prescription: Prescription) => {
    setPrescriptionToDelete(prescription)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!prescriptionToDelete) return

    // Store the prescription before clearing state
    const prescription = prescriptionToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setPrescriptionToDelete(null)

    try {
      // Execute the delete mutation
      deletePrescriptionMutation.mutate(prescription.id)
    } catch (error) {
      // Fallback error handling
      console.error("Delete operation failed:", error)
    }
  }

  const handleUpdate = () => {
    void refetch()
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const patientName = (prescription: Prescription) =>
    prescription.customers ? `${prescription.customers.first_name} ${prescription.customers.last_name}`.trim() : ""

  const hasFilters = searchTerm.length > 0 || statuses.length > 0
  const loadError = error || prescriptionsError

  // Define columns
  const columns: Column<Prescription>[] = [
    {
      key: "prescriptionNumber",
      header: "Prescription #",
      cell: (prescription) => <div className="num font-medium">{prescription.prescription_number}</div>,
      exportValue: (prescription) => prescription.prescription_number,
    },
    {
      key: "customer",
      header: "Patient",
      cell: (prescription) => {
        const name = patientName(prescription)
        return (
          <div className="min-w-0 max-w-[220px]">
            <div className="truncate font-medium" title={name || undefined}>
              {name || <span className="text-muted-foreground">—</span>}
            </div>
            {prescription.customers?.phone && (
              <div className="num text-xs text-muted-foreground">{prescription.customers.phone}</div>
            )}
          </div>
        )
      },
      exportValue: (prescription) => patientName(prescription),
    },
    {
      key: "doctor",
      header: "Prescriber",
      cell: (prescription) => (
        <div className="max-w-[180px] truncate" title={prescription.doctor_name || undefined}>
          {prescription.doctor_name || <span className="text-muted-foreground">—</span>}
        </div>
      ),
      exportValue: (prescription) => prescription.doctor_name ?? "",
    },
    {
      key: "items",
      header: "Medicines",
      cell: (prescription) => {
        const names = prescription.prescription_items
          .map((item) => item.medicines?.name)
          .filter((n): n is string => !!n)
        const count = prescription.prescription_items.length
        return (
          <div className="min-w-0 max-w-[240px]">
            <div className="truncate text-sm" title={names.join(", ") || undefined}>
              {names.length > 0 ? names.join(", ") : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="num">{count}</span> {count === 1 ? "medicine" : "medicines"}
            </div>
          </div>
        )
      },
      exportValue: (prescription) =>
        prescription.prescription_items
          .map((item) => item.medicines?.name)
          .filter(Boolean)
          .join(", "),
    },
    {
      key: "dispensed",
      header: "Dispensed / prescribed",
      className: "text-right",
      cell: (prescription) => {
        const totalItems = getTotalItems(prescription.prescription_items)
        const dispensedItems = getDispensedItems(prescription.prescription_items)
        const complete = totalItems > 0 && dispensedItems >= totalItems
        return (
          <div className="num whitespace-nowrap">
            <span className={complete ? "font-semibold text-success" : "font-semibold"}>{dispensedItems}</span>
            <span className="text-muted-foreground"> / {totalItems}</span>
            <span className="sr-only"> units dispensed</span>
          </div>
        )
      },
      exportValue: (prescription) =>
        `${getDispensedItems(prescription.prescription_items)} / ${getTotalItems(prescription.prescription_items)}`,
    },
    {
      key: "status",
      header: "Status",
      cell: (prescription) => {
        const status = getStatusBadge(prescription.status)
        const StatusIcon = status.icon
        return (
          <Badge variant={status.variant}>
            <StatusIcon aria-hidden />
            {status.label}
          </Badge>
        )
      },
      exportValue: (prescription) => getStatusBadge(prescription.status).label,
    },
    {
      key: "date",
      header: "Prescribed",
      cell: (prescription) => (
        <div className="num whitespace-nowrap">{new Date(prescription.prescribed_date).toLocaleDateString()}</div>
      ),
      exportValue: (prescription) => new Date(prescription.prescribed_date).toLocaleDateString(),
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (prescription) => (
        <div className="num whitespace-nowrap text-sm text-muted-foreground">
          {new Date(prescription.created_at).toLocaleDateString()}
        </div>
      ),
      exportValue: (prescription) => new Date(prescription.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (prescription) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for prescription ${prescription.prescription_number}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(prescription)}>
              <Eye className="h-4 w-4 mr-2" aria-hidden />
              View details
            </DropdownMenuItem>
            {prescription.status === "pending" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleStatusChange(prescription, "filled")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden />
                  Mark as filled
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange(prescription, "partially_filled")}>
                  <CircleDashed className="h-4 w-4 mr-2" aria-hidden />
                  Mark as partially filled
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCancelTarget(prescription)}>
                  <XCircle className="h-4 w-4 mr-2" aria-hidden />
                  Cancel prescription
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleDeleteClick(prescription)}
            >
              <Trash2 className="h-4 w-4 mr-2" aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {loadError && !isLoading ? (
        <ErrorState
          title="We couldn't load prescriptions"
          message={`${typeof loadError === "string" ? loadError : loadError.message || "The server didn't respond."} Check your connection and try again.`}
          onRetry={() => void refetch()}
          retrying={isFetching}
          size="compact"
        />
      ) : (
        <DataTable
          data={prescriptions}
          columns={columns}
          isLoading={isLoading}
          error={null}
          emptyMessage="No prescriptions found"
          emptyState={
            hasFilters ? (
              <EmptyState
                icon={FileText}
                title="No prescriptions match your filters"
                description="Try a different search term or clear the status filter."
                action={{
                  label: "Clear filters",
                  onClick: () => {
                    setSearchTerm("")
                    setStatuses([])
                    setCurrentPage(1)
                  },
                }}
                size="compact"
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No prescriptions yet"
                description="Add a prescription to track what a doctor prescribed and what you have dispensed."
                action={{ label: "Add prescription", onClick: () => setIsCreateModalOpen(true), icon: Plus }}
                size="compact"
              />
            )
          }
          searchPlaceholder="Search Rx no., patient or prescriber…"
          searchValue={searchTerm}
          onSearch={handleSearch}
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={handlePageChange}
          showSerialNumber
          serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
          enableExport
          exportFilename="prescriptions"
          exportTitle="Prescriptions"
          onExportAll={async () => {
            const res = await prescriptionsApi.getPrescriptions({ ...combinedFilters, page: 1, limit: 5000 })
            return res.data || []
          }}
          filters={
            <MultiSelect
              options={[
                { value: "pending", label: "Pending" },
                { value: "partially_filled", label: "Partially filled" },
                { value: "filled", label: "Filled" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              value={statuses}
              onValueChange={(v) => {
                setStatuses(v as Prescription['status'][])
                setCurrentPage(1)
              }}
              placeholder="All statuses"
              className="h-10 w-full sm:w-[180px]"
              allLabel="All statuses"
              showAllOption={true}
            />
          }
          actions={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add prescription
            </Button>
          }
        />
      )}

      <PrescriptionDetailModal
        prescription={selectedPrescription}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <CreatePrescriptionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleUpdate}
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          const target = cancelTarget
          setCancelTarget(null)
          if (target) void handleStatusChange(target, "cancelled")
        }}
        title="Cancel this prescription?"
        description={`Prescription ${cancelTarget?.prescription_number ?? ""} will be marked as cancelled and can no longer be dispensed against.`}
        confirmText="Cancel prescription"
        cancelText="Keep prescription"
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setPrescriptionToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete prescription?"
        description={`Prescription ${prescriptionToDelete?.prescription_number ?? ""} will be permanently deleted. This can't be undone.`}
        confirmText="Delete prescription"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
