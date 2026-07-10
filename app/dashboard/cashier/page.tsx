"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cashShiftsApi, type BranchCashSummaryRow, type CashShift } from "@/features/cash-shifts/api-client"
import { apiGet } from "@/lib/api/client-helpers"
import { CurrencyDisplay } from "@/components/currency-display"

interface Branch {
  id: string
  name: string
  code: string
}

export default function CashierShiftsPage() {
  const { toast } = useToast()
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<string>("")
  const [openingFloat, setOpeningFloat] = useState("0")
  const [countedClose, setCountedClose] = useState("")
  const [notesOpen, setNotesOpen] = useState("")
  const [notesClose, setNotesClose] = useState("")
  const [shifts, setShifts] = useState<CashShift[]>([])
  const [openShift, setOpenShift] = useState<CashShift | null>(null)
  const [summary, setSummary] = useState<BranchCashSummaryRow[] | null>(null)
  const [summaryNote, setSummaryNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadBranches = async () => {
    try {
      const data = await apiGet<Branch[]>("/api/branches")
      setBranches(data ?? [])
      if (data?.length && !branchId) {
        setBranchId(data[0].id)
      }
    } catch (e) {
      toast({
        title: "Branches",
        description: e instanceof Error ? e.message : "Could not load branches",
        variant: "destructive",
      })
    }
  }

  const refreshShifts = async () => {
    try {
      const list = await cashShiftsApi.list({ branch_id: branchId || undefined })
      setShifts(list)
      const open = list.find((s) => s.status === "open" && s.branch_id === branchId) ?? null
      setOpenShift(open)
    } catch (e) {
      toast({
        title: "Shifts",
        description: e instanceof Error ? e.message : "Could not load shifts",
        variant: "destructive",
      })
    }
  }

  const trySummary = async () => {
    try {
      const rows = await cashShiftsApi.branchSummary()
      setSummary(rows)
      setSummaryNote(null)
    } catch {
      setSummary(null)
      setSummaryNote("Multi-branch cash overview requires reports access (managers / admins).")
    }
  }

  useEffect(() => {
    void loadBranches()
    void trySummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (branchId) void refreshShifts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  const handleOpen = async () => {
    if (!branchId) return
    const n = Number.parseFloat(openingFloat)
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Invalid float", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      await cashShiftsApi.open({
        branch_id: branchId,
        opening_float_cash: n,
        notes_opening: notesOpen.trim() || null,
      })
      toast({ title: "Shift opened" })
      setNotesOpen("")
      await refreshShifts()
      await trySummary()
    } catch (e) {
      toast({
        title: "Open failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    if (!openShift) return
    const n = Number.parseFloat(countedClose)
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Enter counted cash", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      await cashShiftsApi.close(openShift.id, {
        counted_cash_closing: n,
        notes_closing: notesClose.trim() || null,
      })
      toast({ title: "Shift closed", description: "Variance recorded on the shift." })
      setCountedClose("")
      setNotesClose("")
      await refreshShifts()
      await trySummary()
    } catch (e) {
      toast({
        title: "Close failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Cashier / Z-Out"
          description="Open and close cash shifts per branch. Expected cash = opening float + cash sales (excludes card and refunds)."
        />

        <Section spacing="lg">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Current shift</CardTitle>
                <CardDescription>Select branch, then open or close the register.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {openShift ? (
                  <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                    <p className="text-sm font-medium">Open since {new Date(openShift.opened_at).toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">
                      Opening float: <CurrencyDisplay amount={openShift.opening_float_cash} />
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="counted">Counted cash in drawer</Label>
                      <Input
                        id="counted"
                        type="number"
                        min={0}
                        step="0.01"
                        value={countedClose}
                        onChange={(e) => setCountedClose(e.target.value)}
                        placeholder="Physical count"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nclose">Closing notes (optional)</Label>
                      <Input
                        id="nclose"
                        value={notesClose}
                        onChange={(e) => setNotesClose(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleClose} disabled={loading}>
                      Close shift (Z-out)
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="float">Opening float (cash)</Label>
                      <Input
                        id="float"
                        type="number"
                        min={0}
                        step="0.01"
                        value={openingFloat}
                        onChange={(e) => setOpeningFloat(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nopen">Opening notes (optional)</Label>
                      <Input id="nopen" value={notesOpen} onChange={(e) => setNotesOpen(e.target.value)} />
                    </div>
                    <Button onClick={handleOpen} disabled={loading || !branchId}>
                      Open shift
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documentation</CardTitle>
                <CardDescription>Receipt vs tax invoice (sales)</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <span className="font-medium text-foreground">Sale / receipt #</span> — internal POS
                  reference (<span className="font-mono">sale_number</span>).
                </p>
                <p>
                  <span className="font-medium text-foreground">Tax invoice #</span> — printed on customer
                  invoice for IRD / VAT (<span className="font-mono">invoice_number</span>), assigned when the
                  sale is posted.
                </p>
                <p>
                  IRD Annex 13 and sales register export both columns when present. Older rows may have an empty
                  invoice until backfilled.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {summary && summary.length > 0 ? (
          <Section spacing="lg">
            <Card>
              <CardHeader>
                <CardTitle>Expected cash by branch (open shifts)</CardTitle>
                <CardDescription>For managers: opening float + cash sales since shift open.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Opening float</TableHead>
                      <TableHead className="text-right">Cash sales</TableHead>
                      <TableHead className="text-right">Expected in drawer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((r) => (
                      <TableRow key={r.branch_id}>
                        <TableCell>{r.branch_name}</TableCell>
                        <TableCell className="text-right">
                          {r.open_shift_id ? <CurrencyDisplay amount={r.opening_float} /> : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.open_shift_id ? <CurrencyDisplay amount={r.cash_sales_since_open} /> : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.open_shift_id ? (
                            <CurrencyDisplay amount={r.expected_in_drawer} />
                          ) : (
                            <span className="text-muted-foreground">No open shift</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Section>
        ) : summaryNote ? (
          <p className="text-sm text-muted-foreground px-1">{summaryNote}</p>
        ) : null}

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Recent shifts</CardTitle>
              <CardDescription>This branch (newest first)</CardDescription>
            </CardHeader>
            <CardContent>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shifts yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Opened</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Float</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.slice(0, 20).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(s.opened_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{s.status}</TableCell>
                        <TableCell className="text-right text-xs">
                          <CurrencyDisplay amount={s.opening_float_cash} />
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {s.expected_cash_system != null ? (
                            <CurrencyDisplay amount={s.expected_cash_system} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {s.counted_cash_closing != null ? (
                            <CurrencyDisplay amount={s.counted_cash_closing} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {s.cash_variance != null ? (
                            <CurrencyDisplay amount={s.cash_variance} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
