"use client"

import { useState } from "react"
import { Download, FileDown, FileSpreadsheet, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { exportReportPdf, exportReportXlsx, type ReportDocument } from "@/features/accounting/lib/report-export"

export type ReportDocumentInput = Omit<ReportDocument, "profile">

interface ReportExportMenuProps {
  /** File name stem, e.g. "profit-and-loss"; the period's dates and the extension are added. */
  baseName: string
  /**
   * Builds the report at click time. May be async (e.g. a general ledger that fetches every page first); return
   * null when there is nothing to export.
   */
  buildDocument: () => ReportDocumentInput | null | Promise<ReportDocumentInput | null>
  /** Existing CSV export, kept as the first item. */
  onCsv?: () => void | Promise<void>
  disabled?: boolean
  label?: string
}

/** Export button for the accounting reports: CSV (when given), Excel and PDF with the pharmacy letterhead. */
export function ReportExportMenu({ baseName, buildDocument, onCsv, disabled, label = "Export" }: ReportExportMenuProps) {
  const { profile } = usePharmacyProfile()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const run = async (format: "pdf" | "xlsx") => {
    setBusy(true)
    try {
      const input = await buildDocument()
      if (!input) {
        toast({ title: "Nothing to export", description: "Load the report first." })
        return
      }
      const doc: ReportDocument = { ...input, profile }
      if (format === "pdf") await exportReportPdf(doc, baseName)
      else await exportReportXlsx(doc, baseName)
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy} loading={busy}>
          <Download aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onCsv && (
          <>
            <DropdownMenuItem onSelect={() => void onCsv()}>
              <FileDown aria-hidden />
              CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => void run("xlsx")}>
          <FileSpreadsheet aria-hidden />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("pdf")}>
          <FileText aria-hidden />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
