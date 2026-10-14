"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/lib/contexts/currency-context"
import { listRoles } from "@/lib/api/roles-api"
import { settingsApi } from "@/features/settings/api-client"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import {
  CONTROLS_KEYS,
  OTHER_ROLES,
  capRoleNames,
  parseCapInput,
  parseInternalControls,
  serializeDiscountCaps,
  type DiscountCap,
} from "@/features/settings/lib/internal-controls"

interface CapText {
  line: string
  bill: string
}

const capText = (cap: DiscountCap | undefined): CapText => ({
  line: cap?.line == null ? "" : String(cap.line),
  bill: cap?.bill == null ? "" : String(cap.bill),
})

/**
 * Settings → System → Internal controls: how deep each role may discount without a manager's approval, the refund
 * amount above which a manager approves, and segregation of duties on manual vouchers. Enforced by the server.
 */
export function InternalControlsCard({ canEdit = true }: { canEdit?: boolean }) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const { data: settingRows, isLoading } = useSystemSettings()
  const roles = useQuery({ queryKey: ["roles", "names"], queryFn: async () => (await listRoles()).map((r) => r.name) })
  const [caps, setCaps] = useState<Record<string, CapText> | null>(null)
  const [threshold, setThreshold] = useState("")
  const [segregation, setSegregation] = useState(false)
  const [requireShift, setRequireShift] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isLoading) return
    const controls = parseInternalControls(settingRows)
    const names = capRoleNames(roles.data ?? [], controls.discountCaps)
    const next: Record<string, CapText> = {}
    for (const name of names) {
      const key = Object.keys(controls.discountCaps).find((k) => k.toLowerCase() === name.toLowerCase())
      next[name] = capText(key ? controls.discountCaps[key] : name === OTHER_ROLES ? undefined : controls.discountCaps[OTHER_ROLES])
    }
    setCaps(next)
    setThreshold(String(controls.refundApprovalThreshold))
    setSegregation(controls.voucherCreatorCannotPost)
    setRequireShift(controls.requireOpenShift)
  }, [isLoading, settingRows, roles.data])

  if (!caps) return null

  const parsedCaps = Object.fromEntries(
    Object.entries(caps).map(([role, text]) => [role, { line: parseCapInput(text.line), bill: parseCapInput(text.bill) }]),
  )
  const capsValid = Object.values(parsedCaps).every((c) => c.line !== undefined && c.bill !== undefined)
  const thresholdValue = Number(threshold)
  const thresholdValid = threshold.trim() !== "" && Number.isFinite(thresholdValue) && thresholdValue >= 0
  const valid = capsValid && thresholdValid

  const save = async () => {
    if (!valid) return
    setSaving(true)
    const document: Record<string, DiscountCap> = {}
    for (const [role, cap] of Object.entries(parsedCaps)) {
      document[role] = { line: cap.line ?? null, bill: cap.bill ?? null }
    }
    const results = await Promise.all([
      settingsApi.upsert(CONTROLS_KEYS.discountCaps, serializeDiscountCaps(document), "json"),
      settingsApi.upsert(CONTROLS_KEYS.refundApprovalThreshold, String(thresholdValue), "number"),
      settingsApi.upsert(CONTROLS_KEYS.voucherCreatorCannotPost, String(segregation), "boolean"),
      settingsApi.upsert(CONTROLS_KEYS.requireOpenShift, String(requireShift), "boolean"),
    ])
    setSaving(false)
    const failed = results.find((r) => r.error)
    if (failed) {
      toast({ title: "Couldn't save internal controls", description: failed.error ?? undefined, variant: "destructive" })
      return
    }
    await queryClient.invalidateQueries({ queryKey: ["system-settings"] })
    toast({ title: "Internal controls saved" })
  }

  const setCap = (role: string, field: keyof CapText, value: string) =>
    setCaps((prev) => (prev ? { ...prev, [role]: { ...prev[role], [field]: value } } : prev))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Internal controls
        </CardTitle>
        <CardDescription>
          Limits above which a manager approves at the counter by entering their own password. Every approval is recorded
          in Reports → Approvals log. Admins are never limited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Discount limits by role (% of the price)</h3>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Per line</TableHead>
                  <TableHead>Whole bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(caps).map(([role, text]) => (
                  <TableRow key={role}>
                    <TableCell className="font-medium">{role === OTHER_ROLES ? "Any other role" : role}</TableCell>
                    {(["line", "bill"] as const).map((field) => {
                      const invalid = parsedCaps[role][field] === undefined
                      return (
                        <TableCell key={field}>
                          <div className="relative w-28">
                            <Input
                              aria-label={`${role === OTHER_ROLES ? "Any other role" : role} ${field === "line" ? "per line" : "whole bill"} limit`}
                              inputMode="decimal"
                              placeholder="No limit"
                              value={text[field]}
                              onChange={(e) => setCap(role, field, e.target.value)}
                              disabled={!canEdit}
                              aria-invalid={invalid}
                              className="pr-7"
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                          </div>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className={capsValid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
            {capsValid ? "Leave blank for no limit. A user with several roles gets the most generous one." : "Limits are between 0 and 100."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="refund-threshold">Refunds needing approval</Label>
            <Input
              id="refund-threshold"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={!canEdit}
              aria-invalid={!thresholdValid}
            />
            <p className={thresholdValid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
              {thresholdValid
                ? `A refund above ${formatCurrency(thresholdValue)} needs a manager's approval.`
                : "Enter an amount, 0 or more."}
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="voucher-sod">Voucher creator can&apos;t post it</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Whoever drafts or last edits a manual voucher can&apos;t post it; another person with posting rights must.
              </p>
            </div>
            <Switch id="voucher-sod" checked={segregation} onCheckedChange={setSegregation} disabled={!canEdit} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="require-shift">Cash sales need an open shift</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                The counter can&apos;t take cash until someone opens a shift in Cashier / Z-Out, so every rupee is counted at
                close. Turn off only if you don&apos;t use a cash drawer.
              </p>
            </div>
            <Switch id="require-shift" checked={requireShift} onCheckedChange={setRequireShift} disabled={!canEdit} />
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void save()} disabled={saving || !valid}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
              Save internal controls
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
