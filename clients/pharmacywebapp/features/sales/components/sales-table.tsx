"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { saleKeys } from "@/features/sales/hooks/use-sales"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useDebounce } from "@/lib/utils/performance"
import { formatSaleDate } from "@/features/sales/lib/sale-detail"
import {
  DEFAULT_SALES_PAGE_SIZE,
  DEFAULT_SALES_SORT,
  SALES_PAGE_SIZES,
  hasActiveSalesFilters,
  isAmountRangeInvalid,
  toSalesFilters,
  type SalesListState,
} from "@/features/sales/lib/sales-list-filters"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { customersApi, type Customer } from "@/features/customers/api-client"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { branchFilterChoices } from "@/features/branches/lib/branch-access"
import { MoreHorizontal, Eye, Receipt, ShoppingCart } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useSales } from "@/features/sales/hooks/use-sales"
import { usersApi } from "@/features/users/api-client"
import { salesApi, Sale, SalesFilters, type SalePaymentStatusFilter } from "@/features/sales/api-client"
import SalesDetailModal from "./sales-detail-modal"
import { SalesFilterBar } from "./sales-filter-bar"
import ProcessReturnModal from "@/features/returns/components/process-return-modal"

interface SalesTableProps {
  filters?: SalesFilters
  /** Pre-select the medicine filter (e.g. "View all" from a medicine's sales history); the user can clear it. */
  initialMedicineId?: string
}

/** The API caps a page at 200 rows; exports page through up to this many. */
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000
const PICKER_PAGE_SIZE = 50

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((x) => x.id))
  return [...current, ...incoming.filter((x) => !seen.has(x.id))]
}

export default function SalesTable({ filters, initialMedicineId }: SalesTableProps) {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState("")
  const [paymentStatuses, setPaymentStatuses] = useState<SalePaymentStatusFilter[]>([])
  const [paymentMethods, setPaymentMethods] = useState<Sale['payment_method'][]>([])
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined)
  const [sort, setSort] = useState(DEFAULT_SALES_SORT)
  const [minAmountInput, setMinAmountInput] = useState("")
  const [maxAmountInput, setMaxAmountInput] = useState("")
  const [medicineId, setMedicineId] = useState(initialMedicineId ?? "")
  const [customerId, setCustomerId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [cashierId, setCashierId] = useState("")
  const [balanceDueOnly, setBalanceDueOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_SALES_PAGE_SIZE)
  // Typing only hits the API once the input settles.
  const debouncedSearch = useDebounce(searchTerm.trim(), 350)
  const debouncedMin = useDebounce(minAmountInput, 400)
  const debouncedMax = useDebounce(maxAmountInput, 400)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)

  // Picker options: a first page up front, widened by live search as the user types.
  const [medicineOptions, setMedicineOptions] = useState<Medicine[]>([])
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([])
  const [medicineSearching, setMedicineSearching] = useState(false)
  const [customerSearching, setCustomerSearching] = useState(false)
  // A pre-selected medicine may sit outside the picker's first page; load it so its name shows in the chip.
  useEffect(() => {
    if (!initialMedicineId) return
    let cancelled = false
    void medicinesApi.getMedicine(initialMedicineId).then(({ data }) => {
      if (!cancelled && data) setMedicineOptions((prev) => mergeById(prev, [data]))
    })
    return () => {
      cancelled = true
    }
  }, [initialMedicineId])
  const initialMedicines = useQuery({
    queryKey: ["sales", "filters", "medicines"],
    queryFn: () => medicinesApi.getMedicines({ limit: PICKER_PAGE_SIZE, sortBy: "name", sortOrder: "asc" }),
    staleTime: 5 * 60 * 1000,
  })
  const initialCustomers = useQuery({
    queryKey: ["sales", "filters", "customers"],
    queryFn: () => customersApi.getCustomers({ limit: PICKER_PAGE_SIZE }),
    staleTime: 5 * 60 * 1000,
  })
  // Cashier filter options; hidden when the user list can't be read (no permission).
  const cashierOptions = useQuery({
    queryKey: ["sales", "filters", "cashiers"],
    queryFn: () => usersApi.getUsers({ limit: 100, sortBy: "full_name", sortOrder: "asc" }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const cashiers = (cashierOptions.data?.data ?? []).map((u) => ({ id: u.id, name: u.full_name || u.email }))
  const medicines = mergeById(initialMedicines.data?.data ?? [], medicineOptions)
  const customers = mergeById(initialCustomers.data?.data ?? [], customerOptions)

  const handleMedicineSearch = async (query: string) => {
    if (!query) return
    setMedicineSearching(true)
    try {
      const res = await medicinesApi.getMedicines({ search: query, limit: PICKER_PAGE_SIZE, sortBy: "name", sortOrder: "asc" })
      setMedicineOptions((prev) => mergeById(prev, res.data || []))
    } finally {
      setMedicineSearching(false)
    }
  }

  const handleCustomerSearch = async (query: string) => {
    if (!query) return
    setCustomerSearching(true)
    try {
      const res = await customersApi.getCustomers({ search: query, limit: PICKER_PAGE_SIZE })
      setCustomerOptions((prev) => mergeById(prev, res.data || []))
    } finally {
      setCustomerSearching(false)
    }
  }

  const branchAccess = useBranchAccess()
  const branchChoices = branchFilterChoices(branchAccess, branchAccess.branches)
  const showBranchFilter = !branchChoices.locked && branchChoices.options.length > 1
  // Rows span branches only for "All branches"; then each sale shows where it was made.
  const showBranchColumn = showBranchFilter && !branchId
  const branchNameOf = (id: string | null | undefined) =>
    (id && branchAccess.branches.find((b) => b.id.toLowerCase() === id.toLowerCase())?.name) || "—"

  // Every control feeds this one state; toSalesFilters maps it to the request (and the query key).
  const listState: SalesListState = {
    search: debouncedSearch,
    paymentStatuses,
    paymentMethods,
    dateRange,
    minAmount: debouncedMin,
    maxAmount: debouncedMax,
    medicineId,
    customerId,
    branchId,
    cashierId,
    balanceDueOnly,
    sort,
    page: currentPage,
    pageSize,
  }
  const combinedFilters: SalesFilters = toSalesFilters(listState, filters)
  const amountRangeInvalid = isAmountRangeInvalid({ minAmount: minAmountInput, maxAmount: maxAmountInput })
  const hasActiveFilters = hasActiveSalesFilters({
    ...listState,
    search: searchTerm,
    minAmount: minAmountInput,
    maxAmount: maxAmountInput,
  })

  const clearFilters = () => {
    setSearchTerm("")
    setPaymentStatuses([])
    setPaymentMethods([])
    setDateRange(undefined)
    setMinAmountInput("")
    setMaxAmountInput("")
    setMedicineId("")
    setCustomerId("")
    setBranchId("")
    setCashierId("")
    setBalanceDueOnly(false)
    setCurrentPage(1)
  }

  /** Every sale matching the current filters, a page of 200 at a time (the API's page cap). */
  const exportAll = async (): Promise<Sale[]> => {
    const rows: Sale[] = []
    for (let page = 1; rows.length < EXPORT_MAX_ROWS; page++) {
      const res = await salesApi.getSales({ ...combinedFilters, page, limit: EXPORT_PAGE_SIZE })
      if (res.error) throw new Error(res.error)
      const batch = res.data || []
      rows.push(...batch)
      if (batch.length < EXPORT_PAGE_SIZE || rows.length >= (res.total ?? 0)) break
    }
    return rows.slice(0, EXPORT_MAX_ROWS)
  }

  // Use TanStack Query to fetch sales
  const { data: salesResponse, isLoading, isFetching, error } = useSales(combinedFilters)

  const sales = salesResponse?.data || []
  const salesError = salesResponse?.error
  const totalCount = salesResponse?.total ?? sales.length

  // Server-side pagination - API handles pagination
  const totalPages = Math.ceil(totalCount / pageSize)

  const getPaymentStatusBadge = (status: Sale['payment_status']) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "warning" as const }
      case "paid":
        return { label: "Paid", variant: "success" as const }
      case "completed":
        return { label: "Completed", variant: "success" as const }
      case "failed":
        return { label: "Failed", variant: "danger" as const }
      case "refunded":
        return { label: "Refunded", variant: "info" as const }
      default:
        return { label: status, variant: "muted" as const }
    }
  }

  const getPaymentMethodBadge = (method: Sale['payment_method']) => {
    switch (method) {
      case "cash":
        return { label: "Cash", variant: "outline" as const }
      case "card":
        return { label: "Card", variant: "outline" as const }
      case "insurance":
        return { label: "Insurance", variant: "outline" as const }
      case "fonepay":
        return { label: "Fonepay", variant: "outline" as const }
      case "esewa":
        return { label: "eSewa", variant: "outline" as const }
      case "khalti":
        return { label: "Khalti", variant: "outline" as const }
      case "bank":
        return { label: "Bank Transfer", variant: "outline" as const }
      case "credit":
        return { label: "Credit (AR)", variant: "outline" as const }
      case "mixed":
        return { label: "Mixed", variant: "outline" as const }
      case "other":
        return { label: "Other", variant: "outline" as const }
      default:
        return { label: method, variant: "outline" as const }
    }
  }

  const getTotalItems = (items: Sale['sale_items']) => {
    return items.reduce((sum, item) => sum + item.quantity, 0)
  }

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale)
    setIsDetailModalOpen(true)
  }

  const handleProcessReturn = (sale: Sale) => {
    setSelectedSale(sale)
    setIsReturnModalOpen(true)
  }

  const canProcessReturn = (sale: Sale) =>
    sale.status !== "cancelled" &&
    sale.payment_status !== "refunded" &&
    (sale.payment_status === "paid" || sale.payment_status === "completed")

  const handleUpdate = () => {
    void queryClient.invalidateQueries({ queryKey: saleKeys.all })
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<Sale>[] = [
    {
      key: "saleNumber",
      header: "Invoice",
      cell: (sale) => (
        <div className="min-w-0">
          <div className="num whitespace-nowrap font-mono text-sm font-medium">{sale.sale_number}</div>
          {sale.fiscal_year ? (
            <div className="num text-xs text-muted-foreground">FY {sale.fiscal_year}</div>
          ) : !sale.invoice_number ? (
            <div className="text-xs text-muted-foreground">No tax invoice</div>
          ) : null}
        </div>
      ),
      exportValue: (sale) => sale.sale_number,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (sale) => {
        const name = sale.customers ? `${sale.customers.first_name ?? ""} ${sale.customers.last_name ?? ""}`.trim() : ""
        return (
          <div className="min-w-0 max-w-[220px]">
            {name ? (
              <div className="truncate font-medium" title={name}>
                {name}
              </div>
            ) : (
              <div className="text-muted-foreground">Walk-in customer</div>
            )}
            {sale.customers?.phone && <div className="num text-sm text-muted-foreground">{sale.customers.phone}</div>}
          </div>
        )
      },
      exportValue: (sale) =>
        sale.customers ? `${sale.customers.first_name} ${sale.customers.last_name}` : "Walk-in",
    },
    {
      key: "items",
      header: "Items",
      className: "text-right",
      cell: (sale) => <div className="num">{getTotalItems(sale.sale_items)}</div>,
      exportValue: (sale) => getTotalItems(sale.sale_items),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (sale) => (
        <div className="num text-right">
          <div className="font-semibold">
            <CurrencyDisplay amount={sale.total_amount} />
          </div>
          {parseFloat(sale.discount_amount) > 0 && (
            <div className="text-xs text-muted-foreground">
              Discount −<CurrencyDisplay amount={sale.discount_amount} />
            </div>
          )}
        </div>
      ),
      exportValue: (sale) => sale.total_amount,
    },
    {
      key: "balanceDue",
      header: "Balance due",
      className: "text-right",
      cell: (sale) => {
        const due = Number.parseFloat(sale.balance_due ?? "0")
        if (sale.status === "cancelled" || !(due > 0)) return <div className="num text-right text-muted-foreground">—</div>
        return (
          <div className="num text-right font-medium text-warning">
            <CurrencyDisplay amount={sale.balance_due ?? "0"} />
          </div>
        )
      },
      exportValue: (sale) => sale.balance_due ?? "0.00",
    },
    {
      key: "payment",
      header: "Payment",
      cell: (sale) => {
        const paymentMethod = getPaymentMethodBadge(sale.payment_method)
        return <Badge variant={paymentMethod.variant}>{paymentMethod.label}</Badge>
      },
      exportValue: (sale) => sale.payment_method,
    },
    {
      key: "status",
      header: "Status",
      cell: (sale) => {
        if (sale.status === "cancelled") {
          return <Badge variant="danger">Cancelled</Badge>
        }
        const paymentStatus = getPaymentStatusBadge(sale.payment_status)
        return <Badge variant={paymentStatus.variant}>{paymentStatus.label}</Badge>
      },
      exportValue: (sale) => (sale.status === "cancelled" ? "Cancelled" : sale.payment_status),
    },
    ...(showBranchColumn
      ? [
          {
            key: "branch",
            header: "Branch",
            cell: (sale: Sale) => <span className="whitespace-nowrap text-sm">{branchNameOf(sale.branch_id)}</span>,
            exportValue: (sale: Sale) => branchNameOf(sale.branch_id),
          } satisfies Column<Sale>,
        ]
      : []),
    {
      key: "date",
      header: "Date",
      cell: (sale) => {
        const { ad, bs } = formatSaleDate(sale.sale_date)
        return (
          <div className="whitespace-nowrap">
            <div className="num">{ad}</div>
            {bs && <div className="num text-xs text-muted-foreground">{bs}</div>}
          </div>
        )
      },
      exportValue: (sale) => formatSaleDate(sale.sale_date).ad,
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (sale) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label={`Actions for sale ${sale.sale_number}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => handleViewDetails(sale)}>
              <Eye className="h-4 w-4 mr-2" aria-hidden />
              View details
            </DropdownMenuItem>
            {canProcessReturn(sale) && (
              <DropdownMenuItem onClick={() => handleProcessReturn(sale)}>
                <Receipt className="h-4 w-4 mr-2" aria-hidden />
                Process return
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const setAndResetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-4">
      <SalesFilterBar
        search={searchTerm}
        onSearchChange={handleSearch}
        dateRange={dateRange}
        onDateRangeChange={setAndResetPage(setDateRange)}
        sort={sort}
        onSortChange={setAndResetPage(setSort)}
        medicineId={medicineId}
        onMedicineChange={setAndResetPage(setMedicineId)}
        medicines={medicines}
        onMedicineSearch={handleMedicineSearch}
        medicineSearching={medicineSearching}
        showCustomer={!filters?.customerId}
        customerId={customerId}
        onCustomerChange={setAndResetPage(setCustomerId)}
        customers={customers}
        onCustomerSearch={handleCustomerSearch}
        customerSearching={customerSearching}
        showBranch={showBranchFilter}
        branchId={branchId}
        onBranchChange={setAndResetPage(setBranchId)}
        branches={branchChoices.options}
        cashierId={cashierId}
        onCashierChange={setAndResetPage(setCashierId)}
        cashiers={cashiers}
        balanceDueOnly={balanceDueOnly}
        onBalanceDueOnlyChange={setAndResetPage(setBalanceDueOnly)}
        paymentStatuses={paymentStatuses}
        onPaymentStatusesChange={setAndResetPage(setPaymentStatuses)}
        paymentMethods={paymentMethods}
        onPaymentMethodsChange={setAndResetPage(setPaymentMethods)}
        minAmount={minAmountInput}
        maxAmount={maxAmountInput}
        onMinAmountChange={setAndResetPage(setMinAmountInput)}
        onMaxAmountChange={setAndResetPage(setMaxAmountInput)}
        amountRangeInvalid={amountRangeInvalid}
        onClearAll={clearFilters}
        resultCount={salesResponse?.total}
        isFetching={isFetching}
      />

      <DataTable
        data={sales}
        columns={columns}
        isLoading={isLoading}
        error={error || salesError}
        emptyMessage="No sales found"
        emptyState={
          hasActiveFilters ? (
            <EmptyState
              size="compact"
              icon={ShoppingCart}
              title="No sales match these filters"
              description="Try a different invoice number, customer name or phone, or clear the filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={ShoppingCart}
              title="No sales yet"
              description="Completed sales appear here with their invoice, payment method and status."
              action={{ label: "New sale", href: "/dashboard/sales/new", icon: ShoppingCart }}
            />
          )
        }
        showSearch={false}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={pageSize}
        itemsPerPageOptions={SALES_PAGE_SIZES}
        onItemsPerPageChange={(size) => {
          setPageSize(size)
          setCurrentPage(1)
        }}
        onPageChange={handlePageChange}
        onRowClick={handleViewDetails}
        showSerialNumber
        serialOffset={(currentPage - 1) * pageSize}
        enableExport
        exportFilename="sales"
        exportTitle="Sales"
        onExportAll={exportAll}
      />

      <SalesDetailModal
        sale={selectedSale}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onReturnProcessed={handleUpdate}
      />

      {/* <CreateSaleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleUpdate}
      /> */}

      <ProcessReturnModal
        sale={selectedSale}
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        onSuccess={handleUpdate}
      />

    </div>
  )
}
