"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DualDateInput } from "@/components/ui/dual-date-input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { Loader2 } from "lucide-react"
import { formatLocalDateYmd } from "@/lib/utils/date"

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toYmd(d: Date) {
  return formatLocalDateYmd(d)
}

interface NewJournalTabProps {
  accounts: AccountingAccount[]
}

export default function NewJournalTab({ accounts }: NewJournalTabProps) {
  const { toast } = useToast()

  const [journalDate, setJournalDate] = useState(toYmd(new Date()))
  const [journalNarration, setJournalNarration] = useState("")
  const [journalLines, setJournalLines] = useState<
    { account_id: string; description: string; debit_amount: number; credit_amount: number }[]
  >([
    { account_id: "", description: "", debit_amount: 0, credit_amount: 0 },
    { account_id: "", description: "", debit_amount: 0, credit_amount: 0 },
  ])
  const [journalSaving, setJournalSaving] = useState(false)
  const [lastDraftId, setLastDraftId] = useState<string | null>(null)

  const journalTotals = useMemo(() => {
    const dr = journalLines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
    const cr = journalLines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
    return { dr, cr, ok: Number(dr.toFixed(2)) === Number(cr.toFixed(2)) && dr > 0 }
  }, [journalLines])

  const saveJournalDraft = async () => {
    const lines = journalLines
      .filter((l) => l.account_id)
      .map((l) => ({
        account_id: l.account_id,
        description: l.description || null,
        debit_amount: Number(l.debit_amount) || 0,
        credit_amount: Number(l.credit_amount) || 0,
      }))
    if (lines.length < 2) {
      toast({ title: "Add at least two lines with accounts", variant: "destructive" })
      return
    }
    if (!journalTotals.ok) {
      toast({ title: "Debits must equal credits", variant: "destructive" })
      return
    }
    setJournalSaving(true)
    try {
      const res = await accountingApi.createManualDraft({
        voucher_date: journalDate,
        narration: journalNarration || null,
        lines,
      })
      setLastDraftId(res.id)
      toast({ title: "Draft saved", description: res.voucher_no })
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setJournalSaving(false)
    }
  }

  const postLastDraft = async () => {
    if (!lastDraftId) {
      toast({ title: "Save a draft first", variant: "destructive" })
      return
    }
    setJournalSaving(true)
    try {
      await accountingApi.postVoucher(lastDraftId)
      toast({ title: "Voucher posted" })
      setLastDraftId(null)
    } catch (e) {
      toast({
        title: "Post failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setJournalSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual journal voucher</CardTitle>
        <CardDescription>
          Balanced lines only. Save as draft, then post. System sale vouchers are created automatically from
          completed sales.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Voucher date</Label>
            <DualDateInput value={journalDate} onChange={setJournalDate} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Narration</Label>
            <Input
              value={journalNarration}
              onChange={(e) => setJournalNarration(e.target.value)}
              placeholder="e.g. Month-end adjustment"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setJournalLines((prev) => [
                  ...prev,
                  { account_id: "", description: "", debit_amount: 0, credit_amount: 0 },
                ])
              }
            >
              Add line
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Account</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right w-28">Debit</TableHead>
                  <TableHead className="text-right w-28">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journalLines.map((line, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Select
                        value={line.account_id || undefined}
                        onValueChange={(v) => {
                          setJournalLines((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, account_id: v } : r))
                          )
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => {
                          const v = e.target.value
                          setJournalLines((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, description: v } : r))
                          )
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="text-right"
                        min={0}
                        step="0.01"
                        value={line.debit_amount || ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0
                          setJournalLines((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, debit_amount: v, credit_amount: v > 0 ? 0 : r.credit_amount } : r
                            )
                          )
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="text-right"
                        min={0}
                        step="0.01"
                        value={line.credit_amount || ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0
                          setJournalLines((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, credit_amount: v, debit_amount: v > 0 ? 0 : r.debit_amount } : r
                            )
                          )
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            Debits: <span className="font-medium">{fmt(journalTotals.dr)}</span> — Credits:{" "}
            <span className="font-medium">{fmt(journalTotals.cr)}</span>
            {journalTotals.ok ? (
              <span className="text-green-600 ml-2">Balanced</span>
            ) : (
              <span className="text-destructive ml-2">Not balanced</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveJournalDraft()} disabled={journalSaving}>
            {journalSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          <Button variant="secondary" onClick={() => void postLastDraft()} disabled={journalSaving || !lastDraftId}>
            Post last draft
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Manual journal entries are identified as <span className="font-medium">MJE</span> in voucher register.
        </p>

      </CardContent>
    </Card>
  )
}
