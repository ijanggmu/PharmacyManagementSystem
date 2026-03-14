"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DateRangePicker } from "@/components/date-range-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"

interface DateRange {
  from: Date
  to: Date
}

interface AuditLogRow {
  id: string
  user_id: string | null
  table_name: string
  record_id: string
  action: string
  created_at: string
  ip_address: string | null
  user_agent: string | null
}

export default function AuditLogsPage() {
  const { toast } = useToast()
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [tableFilter, setTableFilter] = useState("")
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })

  const loadLogs = async () => {
    if (!dateRange) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      })
      if (tableFilter) params.set("table", tableFilter)
      if (actionFilter) params.set("action", actionFilter)

      const res = await fetch(`/api/reports/audit-logs?${params.toString()}`)
      if (!res.ok) {
        throw new Error("Failed to load audit logs")
      }
      const body = await res.json()
      setLogs(body.data || [])
      const meta = body.meta || body.data?.meta || {}
      if (meta.totalPages) {
        setTotalPages(meta.totalPages)
      } else if (meta.total && meta.limit) {
        setTotalPages(Math.max(1, Math.ceil(meta.total / meta.limit)))
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load audit logs.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleApplyFilters = () => {
    setPage(1)
    loadLogs()
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Audit Logs"
          description="View recent activity and changes for this tenant."
        />

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Refine the audit log results</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Date range</span>
                <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Table</span>
                <Input
                  placeholder="e.g. sales, medicines"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Action</span>
                <Select
                  value={actionFilter ?? "ANY"}
                  onValueChange={(val) => setActionFilter(val === "ANY" ? undefined : val)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Any</SelectItem>
                    <SelectItem value="INSERT">INSERT</SelectItem>
                    <SelectItem value="UPDATE">UPDATE</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 flex justify-end">
                <Button onClick={handleApplyFilters}>Apply</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent audit logs</CardTitle>
              <CardDescription>Most recent actions within your tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingState size="md" text="Loading audit logs..." />
              ) : logs.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No audit logs found for the selected criteria.
                </div>
              ) : (
                <div className="border rounded-md max-h-[500px] overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Time</th>
                        <th className="px-3 py-2 text-left font-medium">User</th>
                        <th className="px-3 py-2 text-left font-medium">Table</th>
                        <th className="px-3 py-2 text-left font-medium">Action</th>
                        <th className="px-3 py-2 text-left font-medium">Record ID</th>
                        <th className="px-3 py-2 text-left font-medium">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {log.user_id || "System"}
                          </td>
                          <td className="px-3 py-2">{log.table_name}</td>
                          <td className="px-3 py-2">{log.action}</td>
                          <td className="px-3 py-2 truncate max-w-[160px]">{log.record_id}</td>
                          <td className="px-3 py-2">{log.ip_address || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-between items-center mt-4 text-xs text-muted-foreground">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}

