"use client"

import React, { useState, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  Package,
  Plus,
  Upload,
  Download,
  RotateCcw,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import MedicineDetailModal from "./medicine-detail-modal"
import EditMedicineModal from "./edit-medicine-modal"
import CreateMedicineModal from "./create-medicine-modal"
import ImportInventoryModal from "./import-inventory-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { Pagination } from "@/components/ui/pagination"
import { CurrencyDisplay } from "@/components/currency-display"
import { Medicine } from "@/lib/api/medicines"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { useMedicines, useDeleteMedicine } from "@/lib/hooks/use-medicines"
import { MedicinesFilters } from "@/lib/api/medicines"

interface InventoryTableProps {
  filters?: MedicinesFilters
  openCreateModal?: boolean
  onCreateModalClose?: () => void
}

export default function EnhancedInventoryTable({ filters, openCreateModal = false, onCreateModalClose }: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  const [expiryFilter, setExpiryFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Combine local filters with props filters
  const combinedFilters: MedicinesFilters = {
    ...filters,
    search: searchTerm || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    stockStatus: stockFilter !== "all" ? stockFilter as any : undefined,
    expiryStatus: expiryFilter !== "all" ? expiryFilter as any : undefined,
  }

  // Use TanStack Query to fetch medicines
  const { data: medicinesResponse, isLoading, error } = useMedicines(combinedFilters)
  const deleteMedicineMutation = useDeleteMedicine()

  const medicines = medicinesResponse?.data || []
  const medicinesError = medicinesResponse?.error

  // Listen for filter events from the stats cards
  React.useEffect(() => {
    const handleFilterEvent = (event: CustomEvent) => {
      const { filter } = event.detail
      switch (filter) {
        case 'low-stock':
          setStockFilter('low')
          setExpiryFilter('all')
          break
        case 'expiring-soon':
          setExpiryFilter('expiring')
          setStockFilter('all')
          break
        case 'expired':
          setExpiryFilter('expired')
          setStockFilter('all')
          break
        case 'reset':
          setSearchTerm("")
          setCategoryFilter('all')
          setStockFilter('all')
          setExpiryFilter('all')
          break
        default:
          setStockFilter('all')
          setExpiryFilter('all')
      }
      setCurrentPage(1) // Reset to first page when filtering
    }

    window.addEventListener('inventory-filter', handleFilterEvent as EventListener)
    return () => {
      window.removeEventListener('inventory-filter', handleFilterEvent as EventListener)
    }
  }, [])

  // Get unique categories from the fetched data
  const categories = [...new Set(medicines.map((m: Medicine) => m.categories?.name).filter(Boolean))] as string[]

  const paginatedMedicines = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return medicines.slice(startIndex, startIndex + itemsPerPage)
  }, [medicines, currentPage])

  const totalPages = Math.ceil(medicines.length / itemsPerPage)

  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(openCreateModal)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const { toast } = useToast()

  // Handle external modal open trigger
  React.useEffect(() => {
    if (openCreateModal) {
      setIsCreateModalOpen(true)
    }
  }, [openCreateModal])

  const activeFiltersCount = React.useMemo(() => {
    const filterCount = [categoryFilter, stockFilter, expiryFilter].filter((f) => f !== "all").length
    const searchCount = searchTerm.trim() ? 1 : 0
    return filterCount + searchCount
  }, [categoryFilter, stockFilter, expiryFilter, searchTerm])

  const resetFilters = () => {
    setSearchTerm("")
    setCategoryFilter("all")
    setStockFilter("all")
    setExpiryFilter("all")
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
    // TanStack Query will automatically refetch when needed
  }

  const handleExportInventory = () => {
    try {
      exportToExcel({ medicines }, `inventory_export_${new Date().toISOString().split('T')[0]}`)
      toast({
        title: "Export successful",
        description: "Inventory data has been exported to Excel",
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
      {/* Enhanced Search and Filters */}
      <Card className="bg-gradient-to-r from-gray-50 to-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Inventory Management</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" onClick={handleExportInventory}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Medicine
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search medicines..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 h-10 w-full"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category: string) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={stockFilter}
              onValueChange={(value) => {
                setStockFilter(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Stock Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={expiryFilter}
              onValueChange={(value) => {
                setExpiryFilter(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Expiry Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="expiring">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <button
              type="button"
              onClick={resetFilters}
              title="Click to reset filters"
              className="text-sm text-gray-600 hover:text-blue-600 hover:underline cursor-pointer bg-transparent p-0 m-0"
            >
              Showing {medicines.length} medicines
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-500">{activeFiltersCount} filters active</span>
              </div>
              <Button variant="outline" size="sm" onClick={resetFilters} disabled={activeFiltersCount === 0}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="font-semibold">Medicine Details</TableHead>
              <TableHead className="font-semibold">Category</TableHead>
              <TableHead className="font-semibold">Stock Status</TableHead>
              <TableHead className="font-semibold">Price</TableHead>
              <TableHead className="font-semibold">Expiry Date</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMedicines.map((medicine: Medicine) => {
              const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
              const expiryStatus = getExpiryStatus(medicine.expiry_date)

              return (
                <TableRow key={medicine.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">{medicine.name}</div>
                      <div className="text-sm text-gray-500">
                        {medicine.strength} • {medicine.form}
                        {medicine.generic_name && <span className="ml-2 text-blue-600">({medicine.generic_name})</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {medicine.prescription_required && (
                          <Badge variant="outline" className="text-xs">
                            Prescription Required
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {medicine.categories?.name || "Uncategorized"}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-lg">{medicine.stock_quantity}</span>
                        <span className="text-sm text-gray-500">units</span>
                      </div>
                      <div className="text-xs text-gray-500">Min: {medicine.minimum_stock}</div>
                      <Badge variant={stockStatus.variant} className="flex items-center gap-1 w-fit">
                        {stockStatus.icon}
                        {stockStatus.label}
                      </Badge>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="font-semibold text-green-600 text-lg">
                      <CurrencyDisplay amount={medicine.unit_price} />
                    </div>
                    <div className="text-xs text-gray-500">per unit</div>
                  </TableCell>

                  <TableCell>
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
                  </TableCell>

                  <TableCell>
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
                  </TableCell>

                  <TableCell>
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
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Enhanced Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={medicines.length}
        itemsPerPage={itemsPerPage}
        startIndex={(currentPage - 1) * itemsPerPage}
        onPageChange={setCurrentPage}
      />

      <MedicineDetailModal
        medicine={selectedMedicine}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <EditMedicineModal
        medicine={selectedMedicine}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onUpdate={handleUpdate}
      />

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
