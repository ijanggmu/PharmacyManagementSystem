"use client"

import { useState, useMemo, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelect } from "@/components/ui/multi-select"
import { MoreHorizontal, Edit, Trash2, Eye, Phone, Mail, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import CustomerDetailModal from "./customer-detail-modal"
import EditCustomerModal from "./edit-customer-modal"
import CreateCustomerModal from "./create-customer-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  const [statuses, setStatuses] = useState<("active" | "inactive")[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(openCreateModal)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const { toast } = useToast()

  const combinedFilters: CustomersFilters = {
    ...filters,
    search: searchTerm || undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch customers
  const { data: customersResponse, isLoading, error } = useCustomers(combinedFilters)
  const deleteCustomerMutation = useDeleteCustomer()

  const customers = customersResponse?.data || []
  const customersError = customersResponse?.error
  const totalCount = customersResponse?.total ?? customers.length

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const paginatedCustomers = customers

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

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Customer>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (customer) => (
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
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (customer) => (
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
      ),
    },
    {
      key: "prescriptions",
      header: "Prescriptions",
      cell: (customer) => <div className="font-medium">{customer.prescriptions.length}</div>,
    },
    {
      key: "totalSpent",
      header: "Total Spent",
      cell: (customer) => (
        <div className="font-medium">
          <CurrencyDisplay amount={getTotalSpent(customer.sales).toFixed(2)} />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (customer) => {
        const status = getCustomerStatus(customer)
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
    },
    {
      key: "joined",
      header: "Joined",
      cell: (customer) => <div>{new Date(customer.created_at).toLocaleDateString()}</div>,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (customer) => (
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
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={paginatedCustomers}
        columns={columns}
        isLoading={isLoading}
        error={error || customersError}
        emptyMessage="No customers found"
        searchPlaceholder="Search customers..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
        showSerialNumber
        serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
        filters={
          <MultiSelect
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={statuses}
            onValueChange={(v) => {
              setStatuses(v as ("active" | "inactive")[])
              setCurrentPage(1)
            }}
            placeholder="All Status"
            className="h-10 w-[140px]"
            allLabel="All Status"
            showAllOption={true}
          />
        }
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        }
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
