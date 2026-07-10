"use client"

import React, { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  Download,
  RotateCcw,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import MedicineDetailModal from "./medicine-detail-modal"
import EditMedicineModal from "./edit-medicine-modal"
import CreateMedicineModal from "./create-medicine-modal"
import ImportInventoryModal from "./import-inventory-modal"
import BulkMedicineImportModal from "./bulk-medicine-import-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { Medicine } from "@/features/medicines/api-client"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { useMedicines, useDeleteMedicine, medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { medicinesApi, MedicinesFilters } from "@/features/medicines/api-client"
import { MultiSelect } from "@/components/ui/multi-select"
import { useQueryClient } from "@tanstack/react-query"
import { categoriesApi } from "@/features/medicines/api-client-categories"

interface InventoryTableProps {
  filters?: MedicinesFilters
  openCreateModal?: boolean
  onCreateModalClose?: () => void
}

const STOCK_OPTIONS = [
  { value: "in" as const, label: "In Stock" },
  { value: "low" as const, label: "Low Stock" },
  { value: "out" as const, label: "Out of Stock" },
]
const EXPIRY_OPTIONS = [
  { value: "expiring" as const, label: "Expiring Soon" },
  { value: "expired" as const, label: "Expired" },
]

export default function EnhancedInventoryTable({ filters, openCreateModal = false, onCreateModalClose }: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [stockStatuses, setStockStatuses] = useState<("in" | "low" | "out")[]>([])
  const [expiryStatuses, setExpiryStatuses] = useState<("expiring" | "expired")[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Combine local filters with props filters (multi-select takes precedence)
  const combinedFilters: MedicinesFilters = {
    ...filters,
    search: searchTerm || undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    stockStatuses: stockStatuses.length > 0 ? stockStatuses : undefined,
    expiryStatuses: expiryStatuses.length > 0 ? expiryStatuses : undefined,
    page: currentPage,
    limit: itemsPerPage,
  }

  // Use TanStack Query to fetch medicines
  const queryClient = useQueryClient()
  const { data: medicinesResponse, isLoading, error } = useMedicines(combinedFilters)
  const deleteMedicineMutation = useDeleteMedicine()

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
          setStockStatuses(['low'])
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
          setStockStatuses([])
          setExpiryStatuses([])
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

  // Get unique categories from the fetched data
  const categories = [...new Set(medicines.map((m: Medicine) => m.categories?.name).filter(Boolean))] as string[]

  // Use medicines directly since API handles pagination
  const paginatedMedicines = medicines

  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(openCreateModal)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false)
  const [categoryList, setCategoryList] = useState<Array<{ id: string; name: string }>>([])
  const { toast } = useToast()

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
    const filterCount = categoryIds.length + stockStatuses.length + expiryStatuses.length
    const searchCount = searchTerm.trim() ? 1 : 0
    return filterCount + searchCount
  }, [categoryIds, stockStatuses, expiryStatuses, searchTerm])

  const resetFilters = () => {
    setSearchTerm("")
    setCategoryIds([])
    setStockStatuses([])
    setExpiryStatuses([])
    setCurrentPage(1)
  }

  const getStockStatus = (current: number, minimum: number) => {
    if (current === 0)
      return {
        label: "Out of Stock",
        variant: "destructive" as const,
        icon: <AlertTriangle className="h-3 w-3" />,
      }
    if (current <= minimum)
      return {
        label: "Low Stock",
        variant: "secondary" as const,
        icon: <Package className="h-3 w-3" />,
      }
    return {
      label: "In Stock",
      variant: "default" as const,
      icon: <Package className="h-3 w-3" />,
    }
  }

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null

    const expiry = new Date(expiryDate)
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    if (expiry < now) {
      return {
        label: "Expired",
        variant: "destructive" as const,
        icon: <AlertTriangle className="h-3 w-3" />,
      }
    } else if (expiry <= thirtyDaysFromNow) {
      return {
        label: "Expiring Soon",
        variant: "secondary" as const,
        icon: <Clock className="h-3 w-3" />,
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
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Medicine>[] = [
    {
      key: "medicineDetails",
      header: "Medicine Details",
      cell: (medicine) => {
        const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
        return (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{medicine.name}</div>
            <div className="text-sm text-muted-foreground">
              {medicine.strength} • {medicine.form}
              {medicine.generic_name && <span className="ml-2 text-primary">({medicine.generic_name})</span>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {medicine.prescription_required && (
                <Badge variant="outline" className="text-xs">
                  Prescription Required
                </Badge>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: "category",
      header: "Category",
      cell: (medicine) => (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          {medicine.categories?.name || "Uncategorized"}
        </Badge>
      ),
    },
    {
      key: "stockStatus",
      header: "Stock Status",
      cell: (medicine) => {
        const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
        const hasBranchFigure = medicine.branch_stock_quantity != null
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-lg">
                {hasBranchFigure ? medicine.branch_stock_quantity : medicine.stock_quantity}
              </span>
              <span className="text-sm text-muted-foreground">units</span>
              {hasBranchFigure && <span className="text-xs text-muted-foreground">at this branch</span>}
            </div>
            {hasBranchFigure && (
              <div className="text-xs text-muted-foreground">All branches: {medicine.stock_quantity}</div>
            )}
            <div className="text-xs text-muted-foreground">Min: {medicine.minimum_stock}</div>
            <Badge variant={stockStatus.variant} className="flex items-center gap-1 w-fit">
              {stockStatus.icon}
              {stockStatus.label}
            </Badge>
          </div>
        )
      },
    },
    {
      key: "price",
      header: "Price",
      cell: (medicine) => (
        <div>
          <div className="font-semibold text-primary text-lg">
            <CurrencyDisplay amount={medicine.unit_price} />
          </div>
          <div className="text-xs text-muted-foreground">per unit</div>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (medicine) => <div className="text-sm text-muted-foreground">{new Date(medicine.created_at).toLocaleDateString()}</div>,
    },
    {
      key: "expiryDate",
      header: "Expiry Date",
      cell: (medicine) => {
        const expiryStatus = getExpiryStatus(medicine.expiry_date)
        return (
          <div className="space-y-1">
            <div className="text-sm">
              {medicine.expiry_date ? new Date(medicine.expiry_date).toLocaleDateString() : "No expiry date"}
            </div>
            {expiryStatus && (
              <Badge variant={expiryStatus.variant} className="flex items-center gap-1 w-fit">
                {expiryStatus.icon}
                {expiryStatus.label}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (medicine) => {
        const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
        const expiryStatus = getExpiryStatus(medicine.expiry_date)
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
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (medicine) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(medicine)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEdit(medicine)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Medicine
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(medicine)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const handleExportInventory = async () => {
    try {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" })
      const sessionJson = sessionRes.ok ? await sessionRes.json() : null
      const exportedBy = sessionJson?.data?.user?.email || "Current User"

      // Export all matching rows (same filters, no pagination)
      const exportFilters: MedicinesFilters = {
        ...combinedFilters,
        page: 1,
        limit: 100000,
      }
      const { data: allMedicines } = await medicinesApi.getMedicines(exportFilters)
      const medicinesToExport = allMedicines ?? []

      const documentName = `Inventory Export - ${new Date().toLocaleDateString()}`
      const filename = `inventory_export_${new Date().toISOString().split('T')[0]}`
      
      exportToExcel(
        { medicines: medicinesToExport }, 
        filename,
        {
          exportedBy,
          exportedDate: new Date().toLocaleString(),
          documentName,
          pharmacyName: 'Pharmacy Management System'
        }
      )
      
      toast({
        title: "Export successful",
        description: `${medicinesToExport.length} item(s) exported to Excel`,
      })
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export inventory data",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Table */}
      <DataTable
        data={paginatedMedicines}
        columns={columns}
        isLoading={isLoading}
        error={error || medicinesError}
        emptyMessage="No medicines found"
        searchPlaceholder="Search medicines..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        showSerialNumber
        serialOffset={(currentPage - 1) * itemsPerPage}
        filters={
          <div className="flex gap-2 flex-wrap">
            <MultiSelect
              options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
              value={categoryIds}
              onValueChange={(v) => {
                setCategoryIds(v)
                setCurrentPage(1)
              }}
              placeholder="All Categories"
              className="h-10 w-[180px]"
              allLabel="All Categories"
              showAllOption={true}
            />
            <MultiSelect
              options={STOCK_OPTIONS}
              value={stockStatuses}
              onValueChange={(v) => {
                setStockStatuses(v as ("in" | "low" | "out")[])
                setCurrentPage(1)
              }}
              placeholder="All Stock"
              className="h-10 w-[160px]"
              allLabel="All Stock"
              showAllOption={true}
            />
            <MultiSelect
              options={EXPIRY_OPTIONS}
              value={expiryStatuses}
              onValueChange={(v) => {
                setExpiryStatuses(v as ("expiring" | "expired")[])
                setCurrentPage(1)
              }}
              placeholder="All Items"
              className="h-10 w-[160px]"
              allLabel="All Items"
              showAllOption={true}
            />
          </div>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shrink-0">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Medicine</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Single Medicine
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsBulkImportModalOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Add Medicines
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => setIsImportModalOpen(true)} className="shrink-0">
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Import Excel</span>
            </Button>
            <Button variant="outline" onClick={handleExportInventory} className="shrink-0">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        }
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

      <ImportInventoryModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleUpdate}
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
        title="Delete Medicine"
        description={`Are you sure you want to delete "${medicineToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
