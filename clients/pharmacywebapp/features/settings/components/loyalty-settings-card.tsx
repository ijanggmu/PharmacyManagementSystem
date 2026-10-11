"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Gift, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/lib/contexts/currency-context"
import { settingsApi } from "@/features/settings/api-client"
import { useLoyaltySettings } from "@/features/customers/hooks/use-loyalty-settings"
import { LOYALTY_KEYS, pointsEarnedOn, pointsValue } from "@/features/customers/lib/loyalty"

interface FormState {
  enabled: boolean
  amountPerPoint: string
  pointValue: string
  memberDiscountPercent: string
  minRedeemPoints: string
}

/**
 * Settings → Loyalty: members earn points on purchases and redeem them as a discount; members can
 * also get a standing discount. The example line shows what the numbers mean before saving.
 */
export function LoyaltySettingsCard() {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const { settings, isLoading } = useLoyaltySettings()
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isLoading) return
    setForm({
      enabled: settings.enabled,
      amountPerPoint: String(settings.amountPerPoint),
      pointValue: String(settings.pointValue),
      memberDiscountPercent: String(settings.memberDiscountPercent),
      minRedeemPoints: String(settings.minRedeemPoints),
    })
  }, [isLoading, settings])

  if (!form) return null

  const amountPerPoint = Number(form.amountPerPoint)
  const pointValue = Number(form.pointValue)
  const discount = Number(form.memberDiscountPercent)
  const minRedeem = Number(form.minRedeemPoints)
  const errors = {
    amountPerPoint: !(amountPerPoint > 0) ? "Enter an amount above 0." : null,
    pointValue: !(pointValue >= 0) ? "Can't be negative." : null,
    memberDiscountPercent: !(discount >= 0 && discount <= 100) ? "Between 0 and 100." : null,
    minRedeemPoints: !(Number.isInteger(minRedeem) && minRedeem >= 0) ? "A whole number, 0 or more." : null,
  }
  const valid = Object.values(errors).every((e) => e === null)
  const preview = { ...settings, enabled: true, amountPerPoint, pointValue }
  const earnedOn1000 = valid ? pointsEarnedOn(preview, 1000) : 0

  const save = async () => {
    if (!valid) return
    setSaving(true)
    const results = await Promise.all([
      settingsApi.upsert(LOYALTY_KEYS.enabled, String(form.enabled), "boolean"),
      settingsApi.upsert(LOYALTY_KEYS.amountPerPoint, String(amountPerPoint), "number"),
      settingsApi.upsert(LOYALTY_KEYS.pointValue, String(pointValue), "number"),
      settingsApi.upsert(LOYALTY_KEYS.memberDiscountPercent, String(discount), "number"),
      settingsApi.upsert(LOYALTY_KEYS.minRedeemPoints, String(minRedeem), "number"),
    ])
    setSaving(false)
    const failed = results.find((r) => r.error)
    if (failed) {
      toast({ title: "Couldn't save loyalty settings", description: failed.error ?? undefined, variant: "destructive" })
      return
    }
    await queryClient.invalidateQueries({ queryKey: ["system-settings"] })
    toast({ title: "Loyalty settings saved" })
  }

  const field = (key: keyof Omit<FormState, "enabled">, label: string, hint: string, opts: { step?: string; suffix?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`loyalty-${key}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`loyalty-${key}`}
          type="number"
          inputMode="decimal"
          min={0}
          step={opts.step ?? "any"}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          disabled={!form.enabled}
          aria-invalid={!!errors[key]}
          aria-describedby={`loyalty-${key}-hint`}
          className={opts.suffix ? "pr-10" : undefined}
        />
        {opts.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{opts.suffix}</span>}
      </div>
      <p id={`loyalty-${key}-hint`} className={errors[key] && form.enabled ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {errors[key] && form.enabled ? errors[key] : hint}
      </p>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Gift className="size-4 text-primary" aria-hidden />
              Loyalty programme
            </CardTitle>
            <CardDescription>Members earn points on every purchase and spend them as a discount at the counter.</CardDescription>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm({ ...form, enabled })}
            aria-label="Turn the loyalty programme on or off"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("amountPerPoint", "Spend per point", "How much a member spends to earn 1 point.", { step: "1" })}
          {field("pointValue", "Value of 1 point", "Discount 1 point gives when redeemed.", { step: "0.01" })}
          {field("memberDiscountPercent", "Member discount", "Applied automatically when a member is selected.", { step: "0.5", suffix: "%" })}
          {field("minRedeemPoints", "Minimum points to redeem", "0 lets members redeem any amount.", { step: "1" })}
        </div>
        {form.enabled && valid && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm" aria-live="polite">
            A {formatCurrency(1000)} purchase earns <span className="font-semibold">{earnedOn1000} points</span>, worth{" "}
            <span className="font-semibold">{formatCurrency(pointsValue(preview, earnedOn1000))}</span> off a later bill.
          </p>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={() => void save()} disabled={saving || (form.enabled && !valid)}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
            Save loyalty settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
