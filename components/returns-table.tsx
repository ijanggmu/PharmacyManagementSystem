"use client"

import { useState, useMemo } from "react"
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
  Package,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { CurrencyDisplay } from "./currency-display"

interface MedicineReturn {
  id: string
  return_number: string
  quantity_returned: number
  return_reason: string
  return_type: string
  batch_number: string | null
  return_date: string
  status: string
  notes: string | null
  refund_amount: number
  total_cost: number
  medicines: {
    name: string
    generic_name: string
    strength: string
    form: string
  } | null
  suppliers: {
    name: string
    contact_person: string
  } | null
  users: {
    full_name: string
  } | null
}

interface ReturnsTableProps {
  returns: MedicineReturn[]
}

const ITEMS_PER_PAGE = 10

export default function ReturnsTable({ returns }: ReturnsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [reasonFilter, setReasonFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const { toast } = useToast()

  const filteredReturns = useMemo(() => {
    return returns.filter((returnItem) => {
      const matchesSearch =
        returnItem.return_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        returnItem.medicines?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        returnItem.suppliers?.name.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus = statusFilter === "all" || returnItem.status === statusFilter
      const matchesReason = reasonFilter === "all" || returnItem.return_reason === reasonFilter

      return matchesSearch && matchesStatus && matchesReason
    })
  }, [returns, searchTerm, statusFilter, reasonFilter])

  const totalPages = Math.ceil(filteredReturns.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedReturns = filteredReturns.slice(startIndex, startIndex + ITEMS_PER_PAGE)

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
      default:
        return { label: status, variant: "secondary" as const, icon: Clock }
    }
  }

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case "expired":
        return { label: "Expired", variant: "destructive" as const }
      case "defective":
        return { label: "Defective", variant: "secondary" as const }
      case "wrong_item":
        return { label: "Wrong Item", variant: "outline" as const }
      case "damaged":
        return { label: "Damaged", variant: "secondary" as const }
      default:
        return { label: reason, variant: "outline" as const }
    }
  }

  const handleUpdateStatus = async (returnId: string, newStatus: string) => {
    const supabase = createClient()

    try {
      const { error } = await supabase.from("medicine_returns").update({ status: newStatus }).eq("id", returnId)

      if (error) throw error

      toast({
        title: "Success",
        description: `Return status updated to ${newStatus}`,
      })

      window.location.reload()
    } catch (error) {
      console.error("Error updating return status:", error)
      toast({
        title: "Error",
        description: "Failed to update return status",
        variant: "destructive",
      })
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search returns..."
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
          </SelectContent>
        </Select>

        <Select
          value={reasonFilter}
          onValueChange={(value) => {
            setReasonFilter(value)
            setCurrentPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="defective">Defective</SelectItem>
            <SelectItem value="wrong_item">Wrong Item</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return #</TableHead>
              <TableHead>Medicine</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedReturns.map((returnItem) => {
              const statusBadge = getStatusBadge(returnItem.status)
              const reasonBadge = getReasonBadge(returnItem.return_reason)
              const StatusIcon = statusBadge.icon

              return (
                <TableRow key={returnItem.id}>
                  <TableCell>
                    <div className="font-medium">{returnItem.return_number}</div>
                    {returnItem.batch_number && (
                      <div className="text-sm text-gray-500">Batch: {returnItem.batch_number}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{returnItem.medicines?.name}</div>
                      <div className="text-sm text-gray-500">
                        {returnItem.medicines?.strength} {returnItem.medicines?.form}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{returnItem.suppliers?.name}</div>
                      {returnItem.suppliers?.contact_person && (
                        <div className="text-sm text-gray-500">{returnItem.suppliers.contact_person}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{returnItem.quantity_returned}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={reasonBadge.variant}>{reasonBadge.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-red-600"><CurrencyDisplay amount= {Number(returnItem.total_cost || 0).toFixed(2)}/></div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge.variant} className="flex items-center gap-1 w-fit">
                      <StatusIcon className="h-3 w-3" />
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(returnItem.return_date).toLocaleDateString()}</TableCell>
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
                          Edit Return
                        </DropdownMenuItem>
                        {returnItem.status === "pending" && (
                          <>
                            <DropdownMenuItem onClick={() => handleUpdateStatus(returnItem.id, "approved")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve Return
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateStatus(returnItem.id, "rejected")}>
                              <AlertTriangle className="h-4 w-4 mr-2" />
                              Reject Return
                            </DropdownMenuItem>
                          </>
                        )}
                        {returnItem.status === "approved" && (
                          <DropdownMenuItem onClick={() => handleUpdateStatus(returnItem.id, "completed")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
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
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredReturns.length}
        itemsPerPage={ITEMS_PER_PAGE}
        startIndex={startIndex}
        onPageChange={handlePageChange}
      />
    </div>
  )
}
