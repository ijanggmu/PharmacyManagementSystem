"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MoreHorizontal,
  Edit,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import PrescriptionDetailModal from "./prescription-detail-modal"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface Prescription {
  id: string
  prescription_number: string
  doctor_name: string
  doctor_license: string | null
  issue_date: string
  status: string
  notes: string | null
  created_at: string
  customers: {
    first_name: string
    last_name: string
    phone: string | null
  } | null
  prescription_items: {
    id: string
    quantity_prescribed: number
    quantity_dispensed: number
    medicines: {
      name: string
      strength: string
      form: string
    } | null
  }[]
}

interface PrescriptionTableProps {
  prescriptions: Prescription[]
}

const ITEMS_PER_PAGE = 10

export default function PrescriptionTable({ prescriptions }: PrescriptionTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const { toast } = useToast()

  const filteredPrescriptions = prescriptions.filter(
    (prescription) =>
      prescription.prescription_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prescription.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prescription.customers?.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prescription.customers?.last_name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const totalPages = Math.ceil(filteredPrescriptions.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedPrescriptions = filteredPrescriptions.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const, icon: Clock }
      case "filled":
        return { label: "Filled", variant: "default" as const, icon: CheckCircle }
      case "partially_filled":
        return { label: "Partially Filled", variant: "outline" as const, icon: AlertCircle }
      case "cancelled":
        return { label: "Cancelled", variant: "destructive" as const, icon: AlertCircle }
      default:
        return { label: status, variant: "secondary" as const, icon: Clock }
    }
  }

  const getTotalItems = (items: Prescription["prescription_items"]) => {
    return items.reduce((sum, item) => sum + item.quantity_prescribed, 0)
  }

  const getDispensedItems = (items: Prescription["prescription_items"]) => {
    return items.reduce((sum, item) => sum + item.quantity_dispensed, 0)
  }

  const handleViewDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription)
    setIsDetailModalOpen(true)
  }

  const handleMarkAsFilled = async (prescription: Prescription) => {
    const supabase = createClient()

    try {
      const { error } = await supabase.from("prescriptions").update({ status: "filled" }).eq("id", prescription.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Prescription marked as filled",
      })

      window.location.reload()
    } catch (error) {
      console.error("Error updating prescription:", error)
      toast({
        title: "Error",
        description: "Failed to update prescription",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search prescriptions..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setCurrentPage(1)
          }}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prescription #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPrescriptions.map((prescription) => {
              const statusBadge = getStatusBadge(prescription.status)
              const StatusIcon = statusBadge.icon
              const totalItems = getTotalItems(prescription.prescription_items)
              const dispensedItems = getDispensedItems(prescription.prescription_items)

              return (
                <TableRow key={prescription.id}>
                  <TableCell>
                    <div className="font-medium">{prescription.prescription_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {prescription.customers?.first_name} {prescription.customers?.last_name}
                      </div>
                      {prescription.customers?.phone && (
                        <div className="text-sm text-gray-500">{prescription.customers.phone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{prescription.doctor_name}</div>
                      {prescription.doctor_license && (
                        <div className="text-sm text-gray-500">License: {prescription.doctor_license}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{prescription.prescription_items.length} medications</div>
                      <div className="text-sm text-gray-500">
                        {dispensedItems}/{totalItems} items dispensed
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(prescription.issue_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadge.variant} className="flex items-center gap-1 w-fit">
                      <StatusIcon className="h-3 w-3" />
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(prescription)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          Process Prescription
                        </DropdownMenuItem>
                        {prescription.status !== "filled" && (
                          <DropdownMenuItem onClick={() => handleMarkAsFilled(prescription)}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark as Filled
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredPrescriptions.length)} of{" "}
            {filteredPrescriptions.length} prescriptions
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

      <PrescriptionDetailModal
        prescription={selectedPrescription}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />
    </div>
  )
}
