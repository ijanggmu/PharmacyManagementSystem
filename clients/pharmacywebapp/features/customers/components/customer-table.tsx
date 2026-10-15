"use client"

import { useState, useMemo, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelect } from "@/components/ui/multi-select"
import { MoreHorizontal, Edit, Trash2, Eye, Phone, Mail, Users, UserPlus, CreditCard, Sparkles } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { useDebounce } from "@/lib/utils/performance"
import CustomerDetailModal from "./customer-detail-modal"
import EditCustomerModal from "./edit-customer-modal"
import CreateCustomerModal from "./create-customer-modal"
import { CustomerCardDialog } from "./customer-card-dialog"
import { CreditMeter } from "./credit-meter"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { useCustomers, useDeleteCustomer } from "@/features/customers/hooks/use-customers"
import { useCustomerPermissions } from "@/features/customers/hooks/use-customer-permissions"
import { customersApi, Customer, CustomersFilters } from "@/features/customers/api-client"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

interface CustomerTableProps {
  filters?: CustomersFilters
  openCreateModal?: boolean
  onCreateModalClose?: () => void
}

const ITEMS_PER_PAGE = 10

/** Columns that show money: hidden from a user without Customers.Ledger View. */
const MONEY_COLUMNS = new Set(["balance"])

export default function CustomerTable({ filters, openCreateModal = false, onCreateModalClose }: CustomerTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  // The request waits for typing to pause, so each keystroke does not fetch (and flash the table).
  const debouncedSearch = useDebounce(searchTerm, 300)
  const [statuses, setStatuses] = useState<("active" | "inactive")[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cardCustomer, setCardCustomer] = useState<Customer | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(openCreateModal)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const { toast } = useToast()
  const t = useTranslations("customers")
  const tc = useTranslations("common")
  const { formatBsDate, formatNumber } = useI18n()
  const { canViewMoney } = useCustomerPermissions()

  const combinedFilters: CustomersFilters = {
    ...filters,
    search: debouncedSearch.trim() || undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    includeRelations: true,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  }

  // Use TanStack Query to fetch customers
  const { data: customersResponse, isLoading, error, refetch } = useCustomers(combinedFilters)
  const deleteCustomerMutation = useDeleteCustomer()

  const customers = customersResponse?.data || []
  const customersError = customersResponse?.error
  const totalCount = customersResponse?.total ?? customers.length

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const paginatedCustomers = customers

  // Same flag the status filter sends to the server (isActive), so the badge always agrees with the filter.
  // Rows without the flag fall back to the legacy "has prescriptions or sales" rule.
  const getCustomerStatus = (customer: Customer) => {
    const isActive =
      customer.is_active ?? ((customer.prescriptions ?? []).length > 0 || (customer.sales ?? []).length > 0)
    return isActive
      ? { label: tc("states.active"), variant: "success" as const }
      : { label: tc("states.inactive"), variant: "muted" as const }
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
  const columns: Column<Customer>[] = [
    {
      key: "customer",
      header: t("table.customer"),
      cell: (customer) => (
        <div className="min-w-0 max-w-[220px]">
          {/* The name opens the customer's details (purchases, prescriptions, ledger), as people expect. */}
          <button
            type="button"
            onClick={() => handleViewDetails(customer)}
            className="block max-w-full cursor-pointer truncate text-left font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`${customer.first_name} ${customer.last_name}`}
          >
            {customer.first_name} {customer.last_name}
          </button>
          {(customer.code || customer.is_member) && (
            <div className="flex items-center gap-2 text-xs">
              {customer.code && <span className="font-mono font-medium tracking-wide text-primary">{customer.code}</span>}
              {customer.is_member && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  <span className="num">{formatNumber(customer.loyalty_points ?? 0)}</span> {t("table.points")}
                </span>
              )}
            </div>
          )}
          {customer.date_of_birth && (
            <div className="num text-sm text-muted-foreground">
              {t("table.born", { date: formatBsDate(customer.date_of_birth) })}
            </div>
          )}
        </div>
      ),
      exportValue: (customer) => `${customer.first_name} ${customer.last_name}${customer.code ? ` (${customer.code})` : ""}`,
    },
    {
      key: "contact",
      header: t("table.contact"),
      cell: (customer) => (
        <div className="min-w-0 max-w-[240px] space-y-1">
          {customer.phone && (
            <div className="num flex items-center gap-1.5 text-sm">
              <Phone className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              {customer.phone}
            </div>
          )}
          {customer.email && (
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate" title={customer.email}>
                {customer.email}
              </span>
            </div>
          )}
          {!customer.phone && !customer.email && <span className="text-sm text-muted-foreground">—</span>}
        </div>
      ),
      exportValue: (customer) => [customer.email, customer.phone].filter(Boolean).join(" / "),
    },
    {
      key: "balance",
      header: t("table.balanceOwed"),
      className: "w-[170px]",
      cell: (customer) => (
        <CreditMeter compact balance={customer.current_balance ?? 0} creditLimit={customer.credit_limit} className="w-[150px]" />
      ),
      exportValue: (customer) => (customer.current_balance ?? 0).toFixed(2),
    },
    {
      key: "status",
      header: t("table.status"),
      cell: (customer) => {
        const status = getCustomerStatus(customer)
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
      exportValue: (customer) => getCustomerStatus(customer).label,
    },
    {
      key: "joined",
      header: t("table.joined"),
      cell: (customer) => <div className="num whitespace-nowrap">{formatBsDate(customer.created_at)}</div>,
      exportValue: (customer) => new Date(customer.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (customer) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("table.actionsFor", { name: `${customer.first_name} ${customer.last_name}` })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(customer)}>
              <Eye className="h-4 w-4 mr-2" aria-hidden />
              {t("table.viewProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEdit(customer)}>
              <Edit className="h-4 w-4 mr-2" aria-hidden />
              {t("table.editCustomer")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCardCustomer(customer)} disabled={!customer.code}>
              <CreditCard className="h-4 w-4 mr-2" aria-hidden />
              {t("table.printCard")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => handleDeleteClick(customer)}>
              <Trash2 className="h-4 w-4 mr-2" aria-hidden />
              {t("table.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  // Lookup without money: without Customers.Ledger View the API leaves balances out, so the columns go too.
  const visibleColumns = canViewMoney ? columns : columns.filter((c) => !MONEY_COLUMNS.has(c.key))

  return (
    <div className="space-y-4">
      <DataTable
        data={paginatedCustomers}
        columns={visibleColumns}
        isLoading={isLoading}
        error={error || customersError}
        emptyMessage={t("empty.notFound")}
        emptyState={
          searchTerm || statuses.length > 0 ? (
            <EmptyState
              size="compact"
              icon={Users}
              title={t("empty.noMatchTitle")}
              description={t("empty.noMatchDescription")}
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Users}
              title={t("empty.noneTitle")}
              description={t("empty.noneDescription")}
              action={{ label: t("list.addCustomer"), onClick: () => setIsCreateModalOpen(true), icon: UserPlus }}
            />
          )
        }
        searchPlaceholder={t("table.searchPlaceholder")}
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
        exportFilename="customers"
        exportTitle={t("title")}
        onExportAll={async () => {
          const res = await customersApi.getAllCustomers(combinedFilters)
          if (res.error) throw new Error(res.error)
          return res.data
        }}
        filters={
          <MultiSelect
            options={[
              { value: "active", label: tc("states.active") },
              { value: "inactive", label: tc("states.inactive") },
            ]}
            value={statuses}
            onValueChange={(v) => {
              setStatuses(v as ("active" | "inactive")[])
              setCurrentPage(1)
            }}
            placeholder={t("table.allStatuses")}
            className="h-10 w-[150px]"
            allLabel={t("table.allStatuses")}
            showAllOption={true}
          />
        }
      />

      <CustomerCardDialog customer={cardCustomer} open={cardCustomer !== null} onClose={() => setCardCustomer(null)} />

      <CustomerDetailModal
        customer={selectedCustomer}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onEdit={(customer) => {
          setIsDetailModalOpen(false)
          handleEdit(customer)
        }}
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
        title={t("delete.title")}
        description={t("delete.description", { name: `${customerToDelete?.first_name ?? ""} ${customerToDelete?.last_name ?? ""}`.trim() })}
        confirmText={t("delete.confirm")}
        cancelText={tc("actions.cancel")}
        variant="destructive"
      />
    </div>
  )
}
