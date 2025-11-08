"use client"

import { useState, useMemo, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoreHorizontal, Edit, Trash2, Eye, Phone, Mail, Search, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import CustomerDetailModal from "./customer-detail-modal"
import EditCustomerModal from "./edit-customer-modal"
import CreateCustomerModal from "./create-customer-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "./currency-display"
import { useCustomers, useDeleteCustomer } from "@/lib/hooks/use-customers"
import { Customer, CustomersFilters } from "@/lib/api/customers"

interface CustomerTableProps {
  filters?: CustomersFilters
  openCreateModal?: boolean
  onCreateModalClose?: () => void
}

const ITEMS_PER_PAGE = 10

export default function CustomerTable({ filters, openCreateModal = false, onCreateModalClose }: CustomerTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(openCreateModal)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const { toast } = useToast()

  // Combine local filters with props filters
  const combinedFilters: CustomersFilters = {
    ...filters,
    search: searchTerm || undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch customers
  const { data: customersResponse, isLoading, error } = useCustomers(combinedFilters)
  const deleteCustomerMutation = useDeleteCustomer()

  const customers = customersResponse?.data || []
  const customersError = customersResponse?.error

  // For status filter, pagination is done client-side, otherwise server-side
  const needsClientSidePagination = filters?.status && filters.status !== "all"
  const totalPages = needsClientSidePagination 
    ? Math.ceil(customers.length / ITEMS_PER_PAGE)
    : Math.ceil(customers.length / ITEMS_PER_PAGE) // This would ideally come from API
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedCustomers = useMemo(() => {
    if (needsClientSidePagination) {
      return customers.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }
    return customers
  }, [customers, startIndex, needsClientSidePagination])

  const getCustomerStatus = (customer: Customer) => {
    const hasRecentActivity = customer.prescriptions.length > 0 || customer.sales.length > 0
    return hasRecentActivity
      ? { label: "Active", variant: "default" as const }
      : { label: "Inactive", variant: "secondary" as const }
  }

  const getTotalSpent = (sales: { total_amount: string }[]) => {
    return sales.reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)
  }

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsDetailModalOpen(true)
  }

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsEditModalOpen(true)
  }

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return

    // Store the customer before clearing state
    const customer = customerToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setCustomerToDelete(null)

    try {
      // Execute the delete mutation
      deleteCustomerMutation.mutate(customer.id)
    } catch (error) {
      // Fallback error handling
      console.error("Delete operation failed:", error)
    }
  }

  // Handle external modal open trigger
  useEffect(() => {
    if (openCreateModal) {
      setIsCreateModalOpen(true)
    }
  }, [openCreateModal])

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
              placeholder="Search customers..."
              disabled
              className="pl-10"
            />
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading customers...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || customersError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search customers..."
              disabled
              className="pl-10"
            />
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
        <div className="rounded-md border">
          <div className="p-8 text-center">
            <p className="text-red-500">Failed to load customers</p>
            <p className="text-sm text-gray-500 mt-1">
              {error?.message || customersError || "Please try again later"}
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
            placeholder="Search customers..."
            value={searchTerm || ""}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Prescriptions</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCustomers.map((customer) => {
              const status = getCustomerStatus(customer)
              const totalSpent = getTotalSpent(customer.sales)
              return (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {customer.first_name} {customer.last_name}
                      </div>
                      {customer.date_of_birth && (
                        <div className="text-sm text-gray-500">
                          Born: {new Date(customer.date_of_birth).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-gray-400" />
                          {customer.email}
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-gray-400" />
                          {customer.phone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{customer.prescriptions.length}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium"><CurrencyDisplay amount={totalSpent.toFixed(2)}/></div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>{new Date(customer.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(customer)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(customer)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Customer
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(customer)}>
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
        totalItems={customers.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={startIndex}
        onPageChange={handlePageChange}
      />

      <CustomerDetailModal
        customer={selectedCustomer}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <EditCustomerModal
        customer={selectedCustomer}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onUpdate={handleUpdate}
      />

      <CreateCustomerModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          onCreateModalClose?.()
        }}
        onCreate={handleUpdate}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setCustomerToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Customer"
        description={`Are you sure you want to delete ${customerToDelete?.first_name} ${customerToDelete?.last_name}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
