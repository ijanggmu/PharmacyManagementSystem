"use client"

import { useState, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Phone,
  Mail,
  MapPin,
  Search,
  Plus,
  Package,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import SupplierDetailModal from "./supplier-detail-modal"
import EditSupplierModal from "./edit-supplier-modal"
import CreateSupplierModal from "./create-supplier-modal"
import CreateMedicineModal from "./create-medicine-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/hooks/use-toast"
import { useSuppliers, useDeleteSupplier } from "@/lib/hooks/use-suppliers"
import { Supplier, SuppliersFilters } from "@/lib/api/suppliers"

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
  const { data: suppliersResponse, isLoading, error } = useSuppliers(combinedFilters)
  const deleteSupplierMutation = useDeleteSupplier()

  const suppliers = suppliersResponse?.data || []
  const suppliersError = suppliersResponse?.error

  // For status filter, pagination is done client-side, otherwise server-side
  const needsClientSidePagination = filters?.status && filters.status !== "all"
  const totalPages = needsClientSidePagination 
    ? Math.ceil(suppliers.length / ITEMS_PER_PAGE)
    : Math.ceil(suppliers.length / ITEMS_PER_PAGE) // This would ideally come from API
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedSuppliers = useMemo(() => {
    if (needsClientSidePagination) {
      return suppliers.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }
    return suppliers
  }, [suppliers, startIndex, needsClientSidePagination])

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
    // TanStack Query will automatically refetch when needed
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search suppliers..."
              disabled
              className="pl-10"
            />
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading suppliers...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || suppliersError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search suppliers..."
              disabled
              className="pl-10"
            />
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <p className="text-red-500">Failed to load suppliers</p>
            <p className="text-sm text-gray-500 mt-1">
              {error?.message || suppliersError || "Please try again later"}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search suppliers..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSuppliers.map((supplier) => {
              const status = getSupplierStatus(supplier)
              return (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{supplier.name}</div>
                      {supplier.contact_person && (
                        <div className="text-sm text-gray-500">Contact: {supplier.contact_person}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    {supplier.address ? (
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        <span className="truncate max-w-[200px]">{supplier.address}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No address</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>{new Date(supplier.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
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
                        <DropdownMenuItem onClick={() => {
                          setSelectedSupplierForMedicine(supplier)
                          setIsCreateMedicineOpen(true)
                        }}>
                          <Package className="h-4 w-4 mr-2" />
                          Add Medicine
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
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={suppliers.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={startIndex}
        onPageChange={handlePageChange}
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
