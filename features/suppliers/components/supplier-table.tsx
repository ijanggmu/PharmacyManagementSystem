"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import SupplierDetailModal from "./supplier-detail-modal"
import EditSupplierModal from "./edit-supplier-modal"
import CreateSupplierModal from "./create-supplier-modal"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import BulkMedicineImportModal from "@/features/medicines/components/bulk-medicine-import-modal"
import SupplierLedgerModal from "./supplier-ledger-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { useSuppliers, useDeleteSupplier } from "@/features/suppliers/hooks/use-suppliers"
import { Supplier, SuppliersFilters } from "@/features/suppliers/api-client"
import { CurrencyDisplay } from "@/components/currency-display"

interface SupplierTableProps {
  filters?: SuppliersFilters
}

const ITEMS_PER_PAGE = 10

export default function SupplierTable({ filters }: SupplierTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateMedicineOpen, setIsCreateMedicineOpen] = useState(false)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [isLedgerOpen, setIsLedgerOpen] = useState(false)
  const [supplierForLedger, setSupplierForLedger] = useState<Supplier | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [selectedSupplierForMedicine, setSelectedSupplierForMedicine] = useState<Supplier | null>(null)
  const { toast } = useToast()

  // Combine local filters with props filters
  const combinedFilters: SuppliersFilters = {
    ...filters,
    search: searchTerm || undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch suppliers
  const { data: suppliersResponse, isLoading, error, refetch } = useSuppliers(combinedFilters)
  const deleteSupplierMutation = useDeleteSupplier()

  const suppliers = suppliersResponse?.data || []
  const suppliersError = suppliersResponse?.error
  const totalCount = suppliersResponse?.total ?? suppliers.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const paginatedSuppliers = suppliers

  const getSupplierStatus = (supplier: Supplier) => {
    const hasCompleteInfo = supplier.email && supplier.phone && supplier.contact_person
    return hasCompleteInfo
      ? { label: "Active", variant: "default" as const }
      : { label: "Incomplete", variant: "secondary" as const }
  }

  const handleViewDetails = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setIsDetailModalOpen(true)
  }

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setIsEditModalOpen(true)
  }

  const handleDelete = async (supplier: Supplier) => {
    setSupplierToDelete(supplier)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return

    // Store the supplier before clearing state
    const supplier = supplierToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setSupplierToDelete(null)

    try {
      // Execute the delete mutation
      deleteSupplierMutation.mutate(supplier.id)
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

  // Define columns
  const columns: Column<Supplier>[] = [
    {
      key: "supplier",
      header: "Supplier",
      cell: (supplier) => (
        <div>
          <div className="font-medium">{supplier.name}</div>
          {supplier.contact_person && (
            <div className="text-sm text-gray-500">Contact: {supplier.contact_person}</div>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact Info",
      cell: (supplier) => (
        <div className="space-y-1">
          {supplier.email && (
            <div className="flex items-center gap-1 text-sm">
              <Mail className="h-3 w-3 text-gray-400" />
              {supplier.email}
            </div>
          )}
          {supplier.phone && (
            <div className="flex items-center gap-1 text-sm">
              <Phone className="h-3 w-3 text-gray-400" />
              {supplier.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "address",
      header: "Address",
      cell: (supplier) =>
        supplier.address ? (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="h-3 w-3 text-gray-400" />
            <span className="truncate max-w-[200px]">{supplier.address}</span>
          </div>
        ) : (
          <span className="text-gray-400 text-sm">No address</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (supplier) => {
        const status = getSupplierStatus(supplier)
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
    },
    {
      key: "payable",
      header: "Payable",
      cell: (supplier) => (
        <span className="text-sm">
          <CurrencyDisplay amount={Number(supplier.payable_amount ?? 0)} />
        </span>
      ),
    },
    {
      key: "receivable",
      header: "Receivable",
      cell: (supplier) => (
        <span className="text-sm">
          <CurrencyDisplay amount={Number(supplier.receivable_amount ?? 0)} />
        </span>
      ),
    },
    {
      key: "lastPayment",
      header: "Last Payment",
      cell: (supplier) => {
        const method = supplier.latest_payment_method
        const date = supplier.latest_payment_date
        if (!method && !date) return <span className="text-gray-400 text-sm">—</span>
        return (
          <div className="text-xs">
            <div className="capitalize">{method || "Unknown"}</div>
            <div className="text-gray-500">{date ? new Date(date).toLocaleDateString() : "—"}</div>
          </div>
        )
      },
    },
    {
      key: "bill",
      header: "Latest Bill",
      cell: (supplier) => {
        const billNo = supplier.latest_supplier_bill_number
        const billDate = supplier.latest_supplier_bill_date
        if (!billNo && !billDate) return <span className="text-gray-400 text-sm">—</span>
        return (
          <div className="text-xs">
            <div className="font-mono">{billNo || "—"}</div>
            <div className="text-gray-500">{billDate ? new Date(billDate).toLocaleDateString() : "—"}</div>
          </div>
        )
      },
    },
    {
      key: "added",
      header: "Added",
      cell: (supplier) => <div>{new Date(supplier.created_at).toLocaleDateString()}</div>,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (supplier) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(supplier)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSupplierForLedger(supplier)
                setIsLedgerOpen(true)
              }}
            >
              <ScrollText className="h-4 w-4 mr-2" />
              Ledger &amp; bills
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSelectedSupplierForMedicine(supplier)
                setIsCreateMedicineOpen(true)
              }}
            >
              <Package className="h-4 w-4 mr-2" />
              Add Medicine
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSelectedSupplierForMedicine(supplier)
                setIsBulkImportOpen(true)
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEdit(supplier)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Supplier
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(supplier)}>
              <Trash2 className="h-4 w-4 mr-2" />
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
        data={paginatedSuppliers}
        columns={columns}
        isLoading={isLoading}
        error={error || suppliersError}
        emptyMessage="No suppliers found"
        searchPlaceholder="Search suppliers..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
        showSerialNumber
        serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        }
      />

      <SupplierDetailModal
        supplier={selectedSupplier}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <EditSupplierModal
        supplier={selectedSupplier}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onUpdate={handleUpdate}
      />

      <CreateSupplierModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleUpdate}
      />

      <SupplierLedgerModal
        supplier={supplierForLedger}
        isOpen={isLedgerOpen}
        onClose={() => {
          setIsLedgerOpen(false)
          setSupplierForLedger(null)
        }}
      />

      <CreateMedicineModal
        isOpen={isCreateMedicineOpen}
        onClose={() => {
          setIsCreateMedicineOpen(false)
          setSelectedSupplierForMedicine(null)
        }}
        onCreate={() => {
          setIsCreateMedicineOpen(false)
          setSelectedSupplierForMedicine(null)
          handleUpdate()
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
          handleUpdate()
        }}
        initialSupplierName={selectedSupplierForMedicine?.name}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${supplierToDelete?.name}? This action cannot be undone.`}
      />
    </div>
  )
}
