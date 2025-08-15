"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Edit, Trash2, Eye } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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

export default function InventoryTable({ medicines }: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredMedicines = medicines.filter(
    (medicine) =>
      medicine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const getStockStatus = (current: number, minimum: number) => {
    if (current === 0) return { label: "Out of Stock", variant: "destructive" as const }
    if (current <= minimum) return { label: "Low Stock", variant: "secondary" as const }
    return { label: "In Stock", variant: "default" as const }
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Medicine</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredMedicines.map((medicine) => {
            const stockStatus = getStockStatus(medicine.stock_quantity, medicine.minimum_stock)
            return (
              <TableRow key={medicine.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{medicine.name}</div>
                    <div className="text-sm text-gray-500">
                      {medicine.strength} {medicine.form}
                      {medicine.prescription_required && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Rx
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{medicine.categories?.name || "Uncategorized"}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{medicine.stock_quantity}</div>
                    <div className="text-sm text-gray-500">Min: {medicine.minimum_stock}</div>
                  </div>
                </TableCell>
                <TableCell>${Number.parseFloat(medicine.unit_price).toFixed(2)}</TableCell>
                <TableCell>
                  {medicine.expiry_date ? new Date(medicine.expiry_date).toLocaleDateString() : "N/A"}
                </TableCell>
                <TableCell>
                  <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
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
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
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
  )
}
