"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Ban } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { expiredBatchesApi, type ExpiredBatch } from "@/features/inventory/api-client-expired-batches"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"

export default function ExpiredStockPage() {
  const [batches, setBatches] = useState<ExpiredBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [disposeTarget, setDisposeTarget] = useState<ExpiredBatch | null>(null)
  const [reason, setReason] = useState("")
  const [disposing, setDisposing] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await expiredBatchesApi.list()
      setBatches(res.data)
    } catch (error) {
      toast({ title: "Failed to load expired stock", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDispose = async () => {
    if (!disposeTarget) return
    setDisposing(true)
    try {
      const { error } = await expiredBatchesApi.dispose(disposeTarget.id, reason.trim() || "Expired — routine disposal")
      if (error) throw new Error(error)
      toast({ title: "Batch disposed", description: "Stock and accounting were written off." })
      setDisposeTarget(null)
      setReason("")
      await load()
    } catch (error) {
      toast({ title: "Failed to dispose batch", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setDisposing(false)
    }
  }

  const totalValue = batches.reduce(
    (sum, b) => sum + b.quantity_remaining * Number(b.medicines?.cost_price ?? 0),
    0
  )

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Expired Stock"
          description="Batches past their expiry date that are still counted as stock — excluded from sale but not yet written off"
        />

        <Section spacing="lg">
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Expired Batches</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{batches.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Value at Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  <CurrencyDisplay amount={totalValue} />
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Undisposed Expired Batches
              </CardTitle>
              <CardDescription>Dispose to write off the value and remove it from sellable stock permanently</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : batches.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No expired, undisposed stock — nothing to clean up.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch #</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Expired On</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.medicines?.name || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                          <TableCell>{b.branches?.name || "—"}</TableCell>
                          <TableCell className="text-destructive">{b.expiry_date}</TableCell>
                          <TableCell className="text-right tabular-nums">{b.quantity_remaining}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <CurrencyDisplay amount={b.quantity_remaining * Number(b.medicines?.cost_price ?? 0)} />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setDisposeTarget(b)
                                setReason("")
                              }}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1.5" />
                              Dispose
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </Section>

        <Dialog open={!!disposeTarget} onOpenChange={(open) => !open && setDisposeTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dispose {disposeTarget?.medicines?.name}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This zeroes out {disposeTarget?.quantity_remaining} unit(s) of batch {disposeTarget?.batch_number},
                removes it from sellable stock, and posts a write-off to accounting. This cannot be undone.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="dispose-reason">Reason (optional)</Label>
                <Textarea
                  id="dispose-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. routine expiry disposal"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDisposeTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDispose} disabled={disposing}>
                {disposing ? "Disposing…" : "Dispose"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}
