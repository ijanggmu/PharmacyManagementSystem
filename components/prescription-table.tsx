"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MoreHorizontal, Eye, FileText, Clock, CheckCircle, AlertCircle, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { useToast } from "@/hooks/use-toast"
import { usePrescriptions, useDeletePrescription, useUpdatePrescriptionStatus, PrescriptionsFilters } from "@/lib/hooks/use-prescriptions"
import { Prescription } from "@/lib/api/prescriptions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import PrescriptionDetailModal from "./prescription-detail-modal"
import CreatePrescriptionModal from "./create-prescription-modal"

interface PrescriptionTableProps {
  filters?: PrescriptionsFilters
}

const ITEMS_PER_PAGE = 10

export default function PrescriptionTable({ filters }: PrescriptionTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<Prescription['status'] | "all">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [prescriptionToDelete, setPrescriptionToDelete] = useState<Prescription | null>(null)
  const { toast } = useToast()

  // Combine local filters with props filters
  const combinedFilters: PrescriptionsFilters = {
    ...filters,
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch prescriptions
  const { data: prescriptionsResponse, isLoading, error } = usePrescriptions(combinedFilters)
  const deletePrescriptionMutation = useDeletePrescription()
  const updateStatusMutation = useUpdatePrescriptionStatus()

  const prescriptions = prescriptionsResponse?.data || []
  const prescriptionsError = prescriptionsResponse?.error
  const totalCount = prescriptionsResponse?.total ?? prescriptions.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const getStatusBadge = (status: Prescription['status']) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const, icon: Clock }
      case "filled":
        return { label: "Filled", variant: "default" as const, icon: CheckCircle }
      case "partially_filled":
        return { label: "Partially Filled", variant: "outline" as const, icon: AlertCircle }
      case "cancelled":
        return { label: "Cancelled", variant: "destructive" as const, icon: AlertCircle }
      default:
        return { label: status, variant: "secondary" as const, icon: Clock }
    }
  }

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
    // TanStack Query will automatically refetch when needed
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Prescription>[] = [
    {
      key: "prescriptionNumber",
      header: "Prescription #",
      cell: (prescription) => <div className="font-medium">{prescription.prescription_number}</div>,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (prescription) => (
        <div>
          <div className="font-medium">
            {prescription.customers?.first_name} {prescription.customers?.last_name}
          </div>
          {prescription.customers?.phone && (
            <div className="text-sm text-gray-500">{prescription.customers.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: "doctor",
      header: "Doctor",
      cell: (prescription) => <div className="font-medium">{prescription.doctor_name}</div>,
    },
    {
      key: "items",
      header: "Items",
      cell: (prescription) => {
        const totalItems = getTotalItems(prescription.prescription_items)
        const dispensedItems = getDispensedItems(prescription.prescription_items)
        return (
          <div>
            <div className="font-medium">{totalItems} items</div>
            <div className="text-sm text-gray-500">{dispensedItems} dispensed</div>
          </div>
        )
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (prescription) => {
        const status = getStatusBadge(prescription.status)
        const StatusIcon = status.icon
        return (
          <Badge variant={status.variant} className="flex items-center gap-1 w-fit">
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
        )
      },
    },
    {
      key: "date",
      header: "Date",
      cell: (prescription) => <div>{new Date(prescription.prescribed_date).toLocaleDateString()}</div>,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (prescription) => <div className="text-sm text-muted-foreground">{new Date(prescription.created_at).toLocaleDateString()}</div>,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (prescription) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(prescription)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {prescription.status === "pending" && (
              <>
                <DropdownMenuItem onClick={() => handleStatusChange(prescription, "filled")}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Filled
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange(prescription, "partially_filled")}>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Mark as Partially Filled
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange(prescription, "cancelled")}>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Cancel Prescription
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(prescription)}>
              <FileText className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={prescriptions}
        columns={columns}
        isLoading={isLoading}
        error={error || prescriptionsError}
        emptyMessage="No prescriptions found"
        searchPlaceholder="Search prescriptions..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
        filters={
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as Prescription['status'] | "all")
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="filled">Filled</SelectItem>
              <SelectItem value="partially_filled">Partially Filled</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Prescription
          </Button>
        }
      />

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
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setPrescriptionToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Prescription"
        description={`Are you sure you want to delete prescription ${prescriptionToDelete?.prescription_number}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
