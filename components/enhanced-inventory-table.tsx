"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import MedicineDetailModal from "./medicine-detail-modal"
import EditMedicineModal from "./edit-medicine-modal"
import CreateMedicineModal from "./create-medicine-modal"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface Medicine {
  id: string
  name: string
  generic_name: string
  brand_name: string
  dosage: string
  form: string
  strength: string
  unit_price: string
  stock_quantity: number
  minimum_stock: number
  expiry_date: string
  prescription_required: boolean
  categories: { name: string } | null
  suppliers: { name: string } | null
}

interface InventoryTableProps {
  medicines: Medicine[]
}

export default function EnhancedInventoryTable({ medicines }: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  const [expiryFilter, setExpiryFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const currentDate = new Date()
  const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Get unique categories
  const categories = [...new Set(medicines.map((m) => m.categories?.name).filter(Boolean))]

  const filteredMedicines = useMemo(() => {
    return medicines.filter((medicine) => {
      // Search filter
      const matchesSearch =
        medicine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        medicine.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        medicine.brand_name?.toLowerCase().includes(searchTerm.toLowerCase())

      // Category filter
      const matchesCategory = categoryFilter === "all" || medicine.categories?.name === categoryFilter

      // Stock filter
      let matchesStock = true
      if (stockFilter === "low") {
        matchesStock = medicine.stock_quantity <= medicine.minimum_stock
      } else if (stockFilter === "out") {
        matchesStock = medicine.stock_quantity === 0
      } else if (stockFilter === "in") {
        matchesStock = medicine.stock_quantity > medicine.minimum_stock
      }

      // Expiry filter
      let matchesExpiry = true
      if (expiryFilter === "expiring") {
        if (medicine.expiry_date) {
          const expiryDate = new Date(medicine.expiry_date)
          matchesExpiry = expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
        } else {
          matchesExpiry = false
        }
      } else if (expiryFilter === "expired") {
        if (medicine.expiry_date) {
          const expiryDate = new Date(medicine.expiry_date)
          matchesExpiry = expiryDate < currentDate
        } else {
          matchesExpiry = false
        }
      }

      return matchesSearch && matchesCategory && matchesStock && matchesExpiry
    })
  }, [medicines, searchTerm, categoryFilter, stockFilter, expiryFilter])

  const paginatedMedicines = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredMedicines.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredMedicines, currentPage])

  const totalPages = Math.ceil(filteredMedicines.length / itemsPerPage)

  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const { toast } = useToast()

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

  const handleDelete = async (medicine: Medicine) => {
    const supabase = createClient()

    try {
      const { error } = await supabase.from("medicines").delete().eq("id", medicine.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Medicine deleted successfully",
      })

      // Refresh the page or update the medicines list
      window.location.reload()
    } catch (error) {
      console.error("Error deleting medicine:", error)
      toast({
        title: "Error",
        description: "Failed to delete medicine",
        variant: "destructive",
      })
    }
  }

  const handleUpdate = () => {
    // Refresh the page or update the medicines list
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Search and Filters */}
      <Card className="bg-gradient-to-r from-gray-50 to-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Inventory Management</h2>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Medicine
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search medicines..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 h-10"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category!}>
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
              <SelectTrigger className="h-10">
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
              <SelectTrigger className="h-10">
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
            <p className="text-sm text-gray-600">
              Showing {filteredMedicines.length} of {medicines.length} medicines
            </p>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">
                {[categoryFilter, stockFilter, expiryFilter].filter((f) => f !== "all").length} filters active
              </span>
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
            {paginatedMedicines.map((medicine) => {
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
                      ${Number.parseFloat(medicine.unit_price).toFixed(2)}
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
                        <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(medicine)}>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredMedicines.length)} of {filteredMedicines.length} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-8 h-8 p-0"
                  >
                    {pageNum}
                  </Button>
                )
              })}
              {totalPages > 5 && <span className="text-sm text-gray-500">...</span>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleUpdate}
      />
    </div>
  )
}
