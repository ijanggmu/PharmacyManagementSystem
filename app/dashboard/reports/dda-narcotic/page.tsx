"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Filter } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getNarcoticRegister } from "@/lib/api/reports-api"

interface DateRange {
  from: Date
  to: Date
}

interface NarcoticRow {
  sale_date: string
  sale_number: string | null
  invoice_number: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  prescription_number: string | null
  doctor_name: string | null
  doctor_license: string | null
  medicine_name: string | null
  strength: string | null
  form: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export default function DdaNarcoticRegisterPage() {
  const { toast } = useToast()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })
  const [medicineName, setMedicineName] = useState("")
  const [doctorName, setDoctorName] = useState("")
  const [schedule, setSchedule] = useState("")
  const [rows, setRows] = useState<NarcoticRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    if (dateRange) {
      fetchRows()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildParams = (format: "json" | "csv") => {
    if (!dateRange) return ""
    const params = new URLSearchParams({
      periodStart: dateRange.from.toISOString().split("T")[0],
      periodEnd: dateRange.to.toISOString().split("T")[0],
      format,
    })
    if (medicineName) params.set("medicineName", medicineName)
    if (doctorName) params.set("doctorName", doctorName)
    if (schedule) params.set("schedule", schedule)
    return params.toString()
  }

  const fetchRows = async () => {
    if (!dateRange) return
    setIsLoading(true)
    try {
      const fetched = await getNarcoticRegister({
        periodStart: dateRange.from.toISOString().split("T")[0],
        periodEnd: dateRange.to.toISOString().split("T")[0],
        medicineName,
        doctorName,
        schedule,
      })
      setRows(fetched)
    } catch (error: any) {
      toast({
        title: "Failed to load register",
        description: error.message || "Could not load narcotic register data.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadCsv = async () => {
    if (!dateRange) return
    setIsDownloading(true)
    try {
      const params = buildParams("csv")
      const res = await fetch(`/api/reports/dda-narcotic?${params}`)
      if (!res.ok) {
        throw new Error("Failed to download narcotic register CSV")
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `dda-narcotic-${dateRange.from.toISOString().split("T")[0]}-to-${dateRange.to
        .toISOString()
        .split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast({
        title: "Export started",
        description: "DDA narcotic register CSV has been generated.",
      })
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Could not export DDA register.",
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const renderTable = () => {
    if (!rows || rows.length === 0) {
      return (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No controlled-substance sales found for the selected criteria.
        </div>
      )
    }

    return (
      <div className="border rounded-lg max-h-[480px] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Date</th>
              <th className="px-2 py-2 text-left font-medium">Invoice / Sale #</th>
              <th className="px-2 py-2 text-left font-medium">Patient</th>
              <th className="px-2 py-2 text-left font-medium">DOB</th>
              <th className="px-2 py-2 text-left font-medium">Prescription #</th>
              <th className="px-2 py-2 text-left font-medium">Doctor</th>
              <th className="px-2 py-2 text-left font-medium">Reg. No.</th>
              <th className="px-2 py-2 text-left font-medium">Medicine</th>
              <th className="px-2 py-2 text-left font-medium">Form / Strength</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-right font-medium">Unit Price</th>
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, idx: number) => (
              <tr key={idx} className="border-t">
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.sale_date ? new Date(row.sale_date).toLocaleDateString() : ""}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.invoice_number || row.sale_number || ""}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {`${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.date_of_birth ? new Date(row.date_of_birth).toLocaleDateString() : ""}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{row.prescription_number || ""}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.doctor_name || ""}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.doctor_license || ""}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.medicine_name || ""}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {[row.form, row.strength].filter(Boolean).join(" / ")}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{row.quantity}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {row.unit_price != null ? row.unit_price.toFixed(2) : ""}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {row.line_total != null ? row.line_total.toFixed(2) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">DDA Narcotic Register</h1>
            <p className="text-muted-foreground">
              Controlled-substance dispensing log with patient and prescription details.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>Register Filters</CardTitle>
                <CardDescription>
                  Filter by period, medicine, doctor, or schedule before exporting.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="medicineName" className="text-xs">
                    Medicine
                  </Label>
                  <Input
                    id="medicineName"
                    placeholder="Search medicine name"
                    value={medicineName}
                    onChange={(e) => setMedicineName(e.target.value)}
                    className="w-52"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doctorName" className="text-xs">
                    Doctor
                  </Label>
                  <Input
                    id="doctorName"
                    placeholder="Search doctor name"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="w-52"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule" className="text-xs">
                    Schedule
                  </Label>
                  <Input
                    id="schedule"
                    placeholder="e.g. II, III"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    className="w-32"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={fetchRows} disabled={isLoading}>
                    <Filter className="h-4 w-4 mr-1" />
                    Apply
                  </Button>
                  <Button onClick={handleDownloadCsv} disabled={isDownloading || !dateRange}>
                    <Download className="h-4 w-4 mr-1" />
                    {isDownloading ? "Exporting..." : "Export CSV"}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  <p className="mt-2 text-sm text-muted-foreground">Loading narcotic register…</p>
                </div>
              </div>
            ) : (
              renderTable()
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

