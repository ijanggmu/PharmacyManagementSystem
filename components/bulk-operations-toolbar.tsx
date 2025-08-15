"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, CheckCircle, X, FileSpreadsheet, FileText } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface BulkOperationsToolbarProps {
  selectedItems: string[]
  onClearSelection: () => void
  onRefresh: () => void
  entityType: "medicines" | "customers" | "prescriptions" | "suppliers"
}

export default function BulkOperationsToolbar({
  selectedItems,
  onClearSelection,
  onRefresh,
  entityType,
}: BulkOperationsToolbarProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  if (selectedItems.length === 0) return null

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedItems.length} ${entityType}?`)) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.from(entityType).delete().in("id", selectedItems)

      if (error) throw error

      toast({
        title: "Success",
        description: `${selectedItems.length} ${entityType} deleted successfully`,
      })

      onClearSelection()
      onRefresh()
    } catch (error) {
      console.error("Error deleting items:", error)
      toast({
        title: "Error",
        description: "Failed to delete selected items",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleBulkStatusUpdate = async (status: string) => {
    setIsLoading(true)
    const supabase = createClient()

    try {
      let updateData: any = {}

      if (entityType === "prescriptions") {
        updateData = { status }
      } else if (entityType === "medicines") {
        updateData = { prescription_required: status === "prescription_required" }
      }

      const { error } = await supabase.from(entityType).update(updateData).in("id", selectedItems)

      if (error) throw error

      toast({
        title: "Success",
        description: `${selectedItems.length} ${entityType} updated successfully`,
      })

      onClearSelection()
      onRefresh()
    } catch (error) {
      console.error("Error updating items:", error)
      toast({
        title: "Error",
        description: "Failed to update selected items",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = async (format: "csv" | "json") => {
    setIsLoading(true)
    const supabase = createClient()

    try {
      const { data, error } = await supabase.from(entityType).select("*").in("id", selectedItems)

      if (error) throw error

      let content: string
      let filename: string
      let mimeType: string

      if (format === "csv") {
        // Convert to CSV
        if (data && data.length > 0) {
          const headers = Object.keys(data[0]).join(",")
          const rows = data
            .map((item) =>
              Object.values(item)
                .map((value) => (typeof value === "string" ? `"${value}"` : value))
                .join(","),
            )
            .join("\n")
          content = `${headers}\n${rows}`
        } else {
          content = ""
        }
        filename = `${entityType}_export.csv`
        mimeType = "text/csv"
      } else {
        content = JSON.stringify(data, null, 2)
        filename = `${entityType}_export.json`
        mimeType = "application/json"
      }

      // Download file
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Success",
        description: `Exported ${selectedItems.length} ${entityType} as ${format.toUpperCase()}`,
      })
    } catch (error) {
      console.error("Error exporting data:", error)
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {selectedItems.length} selected
        </Badge>
        <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 px-2">
          <X className="h-3 w-3" />
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {/* Export Options */}
        <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={isLoading} className="h-7">
          <FileSpreadsheet className="h-3 w-3 mr-1" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={isLoading} className="h-7">
          <FileText className="h-3 w-3 mr-1" />
          JSON
        </Button>

        {/* Status Updates */}
        {entityType === "prescriptions" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkStatusUpdate("filled")}
            disabled={isLoading}
            className="h-7"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Mark Filled
          </Button>
        )}

        {/* Delete */}
        <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isLoading} className="h-7">
          <Trash2 className="h-3 w-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  )
}
