"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  MoreHorizontal,
  Edit,
  Eye,
  CheckCircle,
  Clock,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  DollarSign,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface SalesRefund {
  id: string
  refund_number: string
  refund_type: string
  refund_reason: string
  refund_amount: number
  net_refund_amount: number
  refund_method: string
  refund_status: string
  refund_date: string
  processed_date: string | null
  notes: string | null
  sales: {
    sale_number: string
    total_amount: string
    payment_method: string
    sale_date: string
  } | null
  customers: {
    first_name: string
    last_name: string
    phone: string
    email: string
  } | null
  users: {
    full_name: string
  } | null
}

interface RefundsTableProps {
  refunds: SalesRefund[]
}

const ITEMS_PER_PAGE = 10

export default function RefundsTable({ refunds }: RefundsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [reasonFilter, setReasonFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const { toast } = useToast()

  const filteredRefunds = refunds.filter((refund) => {
    const matchesSearch =
      refund.refund_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refund.sales?.sale_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (refund.customers &&
        `${refund.customers.first_name} ${refund.customers.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === "all" || refund.refund_status === statusFilter
    const matchesReason = reasonFilter === "all" || refund.refund_reason === reasonFilter

    return matchesSearch && matchesStatus && matchesReason
  })

  const totalPages = Math.ceil(filteredRefunds.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedRefunds = filteredRefunds.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const, icon: Clock }
      case "approved":
        return { label: "Approved", variant: "default" as const, icon: CheckCircle }
      case "completed":
        return { label: "Completed", variant: "default" as const, icon: CheckCircle }
      case "rejected":
        return { label: "Rejected", variant: "destructive" as const, icon: AlertTriangle }
      case "cancelled":
        return { label: "Cancelled", variant: "outline" as const, icon: AlertTriangle }
      default:
        return { label: status, variant: "secondary" as const, icon: Clock }
    }
  }

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case "defective_product":
        return { label: "Defective Product", variant: "destructive" as const }
      case "wrong_medication":
        return { label: "Wrong Medication", variant: "secondary" as const }
      case "customer_dissatisfaction":
        return { label: "Customer Dissatisfaction", variant: "outline" as const }
      case "expired_product":
        return { label: "Expired Product", variant: "destructive" as const }
      case "doctor_change":
        return { label: "Doctor Change", variant: "outline" as const }
      case "duplicate_purchase":
        return { label: "Duplicate Purchase", variant: "secondary" as const }
      default:
        return { label: reason.replace(/_/g, " "), variant: "outline" as const }
    }
  }

  const handleUpdateStatus = async (refundId: string, newStatus: string) => {
    const supabase = createClient()

    try {
      const updateData: any = { refund_status: newStatus }

      if (newStatus === "completed") {
        updateData.processed_date = new Date().toISOString()
      }

      const { error } = await supabase.from("sales_refunds").update(updateData).eq("id", refundId)

      if (error) throw error

      toast({
        title: "Success",
        description: `Refund status updated to ${newStatus}`,
      })

      window.location.reload()
    } catch (error) {
      console.error("Error updating refund status:", error)
      toast({
        title: "Error",
        description: "Failed to update refund status",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search refunds..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value)
            setCurrentPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={reasonFilter}
          onValueChange={(value) => {
            setReasonFilter(value)
            setCurrentPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            <SelectItem value="defective_product">Defective Product</SelectItem>
            <SelectItem value="wrong_medication">Wrong Medication</SelectItem>
            <SelectItem value="customer_dissatisfaction">Customer Dissatisfaction</SelectItem>
            <SelectItem value="expired_product">Expired Product</SelectItem>
            <SelectItem value="doctor_change">Doctor Change</SelectItem>
            <SelectItem value="duplicate_purchase">Duplicate Purchase</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Refund #</TableHead>
              <TableHead>Original Sale</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRefunds.map((refund) => {
              const statusBadge = getStatusBadge(refund.refund_status)
              const reasonBadge = getReasonBadge(refund.refund_reason)
              const StatusIcon = statusBadge.icon

              return (
                <TableRow key={refund.id}>
                  <TableCell>
                    <div className="font-medium">{refund.refund_number}</div>
                    <div className="text-sm text-gray-500 capitalize">{refund.refund_type.replace(/_/g, " ")}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{refund.sales?.sale_number}</div>
                      <div className="text-sm text-gray-500">
                        ${Number(refund.sales?.total_amount || 0).toFixed(2)} • {refund.sales?.payment_method}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {refund.customers ? (
                      <div>
                        <div className="font-medium">
                          {refund.customers.first_name} {refund.customers.last_name}
                        </div>
                        {refund.customers.phone && (
                          <div className="text-sm text-gray-500">{refund.customers.phone}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500">Walk-in Customer</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={reasonBadge.variant}>{reasonBadge.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-red-600">${Number(refund.refund_amount).toFixed(2)}</div>
                      <div className="text-sm text-gray-500">Net: ${Number(refund.net_refund_amount).toFixed(2)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge.variant} className="flex items-center gap-1 w-fit">
                      <StatusIcon className="h-3 w-3" />
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="text-sm">{new Date(refund.refund_date).toLocaleDateString()}</div>
                      {refund.processed_date && (
                        <div className="text-xs text-gray-500">
                          Processed: {new Date(refund.processed_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Refund
                        </DropdownMenuItem>
                        {refund.refund_status === "pending" && (
                          <>
                            <DropdownMenuItem onClick={() => handleUpdateStatus(refund.id, "approved")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve Refund
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateStatus(refund.id, "rejected")}>
                              <AlertTriangle className="h-4 w-4 mr-2" />
                              Reject Refund
                            </DropdownMenuItem>
                          </>
                        )}
                        {refund.refund_status === "approved" && (
                          <DropdownMenuItem onClick={() => handleUpdateStatus(refund.id, "completed")}>
                            <DollarSign className="h-4 w-4 mr-2" />
                            Mark Completed
                          </DropdownMenuItem>
                        )}
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredRefunds.length)} of{" "}
            {filteredRefunds.length} refunds
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-8 h-8 p-0"
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
