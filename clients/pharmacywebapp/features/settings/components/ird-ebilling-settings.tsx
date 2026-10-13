"use client"

import { useEffect, useState, type ReactNode } from "react"
import { AlertTriangle, FlaskConical, KeyRound, Save, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { useToast } from "@/hooks/use-toast"
import { useIrdSettings, useUpdateIrdSettings } from "@/features/settings/hooks/use-ird-settings"
import { DEFAULT_ABBREVIATED_INVOICE_THRESHOLD, isValidPan, type IrdSettings, type IrdSettingsInput } from "@/lib/api/ird-api"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"

interface Draft {
  enabled: boolean
  baseUrl: string
  username: string
  password: string
  sellerPan: string
  threshold: string
}

function toDraft(settings: IrdSettings | undefined): Draft {
  return {
    enabled: settings?.enabled ?? false,
    baseUrl: settings?.baseUrl ?? "",
    username: settings?.username ?? "",
    password: "",
    sellerPan: settings?.sellerPan ?? "",
    threshold: String(settings?.abbreviatedInvoiceThreshold ?? DEFAULT_ABBREVIATED_INVOICE_THRESHOLD),
  }
}

/** Validates the draft; returns field → message. */
export function validateIrdDraft(draft: Draft, hasStoredPassword: boolean): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {}
  if (draft.baseUrl.trim() && !/^https?:\/\/\S+$/i.test(draft.baseUrl.trim())) errors.baseUrl = "Enter an http(s) URL."
  if (draft.sellerPan.trim() && !isValidPan(draft.sellerPan)) errors.sellerPan = "PAN must be 9 digits."
  const threshold = Number(draft.threshold)
  if (!Number.isFinite(threshold) || threshold < 0) errors.threshold = "Enter an amount of 0 or more."
  if (draft.enabled) {
    if (!draft.username.trim()) errors.username = "Required to turn e-billing on."
    if (!draft.password.trim() && !hasStoredPassword) errors.password = "Required to turn e-billing on."
    if (!draft.sellerPan.trim()) errors.sellerPan = "Required to turn e-billing on."
  }
  return errors
}

/**
 * IRD CBMS e-billing connection. Once on, every completed sale's bill and every credit note (return, refund,
 * cancellation) is sent to CBMS automatically; failures show under System logs › Integrations › IRD dispatch.
 */
export default function IrdEBillingSettings({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast()
  const query = useIrdSettings()
  const update = useUpdateIrdSettings()
  const [draft, setDraft] = useState<Draft>(() => toDraft(undefined))
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data))
  }, [query.data])

  if (query.isLoading) return <Skeleton className="h-64 w-full" />
  if (query.isError) {
    return (
      <ErrorState
        size="compact"
        title="Couldn't load IRD settings"
        message={apiRequestErrorMessage(query.error) || "Failed to load the IRD e-billing settings."}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    )
  }

  const settings = query.data
  const errors = validateIrdDraft(draft, settings?.hasPassword ?? false)
  const shown = submitted ? errors : {}
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const save = () => {
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    const input: IrdSettingsInput = {
      enabled: draft.enabled,
      baseUrl: draft.baseUrl.trim() || null,
      username: draft.username.trim() || null,
      password: draft.password.trim() || null,
      sellerPan: draft.sellerPan.trim() || null,
      abbreviatedInvoiceThreshold: Math.round(Number(draft.threshold) * 100) / 100,
    }
    update.mutate(input, {
      onSuccess: () => {
        setSubmitted(false)
        toast({ title: "IRD settings saved" })
      },
      onError: (error) =>
        toast({ title: "Couldn't save IRD settings", description: apiRequestErrorMessage(error) || error.message, variant: "destructive" }),
    })
  }

  const field = (id: keyof Draft, label: string, input: ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ird-${id}`}>{label}</Label>
      {input}
      {shown[id] ? (
        <p id={`ird-${id}-error`} role="alert" className="flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {shown[id]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">Send bills to IRD (CBMS) automatically</p>
          <p className="text-muted-foreground">
            Bills reach CBMS within {settings?.realtimeWindowSeconds ?? 120} seconds of the sale are reported as real-time.
            Credit notes follow their bill.
          </p>
        </div>
        <Switch
          id="ird-enabled"
          aria-label="IRD e-billing enabled"
          checked={draft.enabled}
          disabled={!canEdit}
          onCheckedChange={(enabled) => set({ enabled })}
        />
      </div>

      {settings?.isTestEndpoint ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          Sending to IRD&apos;s test server ({settings.effectiveBaseUrl}). Set the production CBMS URL below before going live.
        </p>
      ) : settings ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
          Sending to {settings.effectiveBaseUrl}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "baseUrl",
          "CBMS base URL",
          <Input
            id="ird-baseUrl"
            placeholder="https://cbapi.ird.gov.np"
            value={draft.baseUrl}
            disabled={!canEdit}
            aria-invalid={Boolean(shown.baseUrl)}
            onChange={(e) => set({ baseUrl: e.target.value })}
          />,
          "Leave empty to use the server default.",
        )}
        {field(
          "sellerPan",
          "Pharmacy PAN / VAT no.",
          <Input
            id="ird-sellerPan"
            inputMode="numeric"
            maxLength={9}
            value={draft.sellerPan}
            disabled={!canEdit}
            aria-invalid={Boolean(shown.sellerPan)}
            onChange={(e) => set({ sellerPan: e.target.value.replace(/\D/g, "") })}
          />,
        )}
        {field(
          "username",
          "CBMS API username",
          <Input
            id="ird-username"
            autoComplete="off"
            value={draft.username}
            disabled={!canEdit}
            aria-invalid={Boolean(shown.username)}
            onChange={(e) => set({ username: e.target.value })}
          />,
          "Issued by IRD when the billing software is registered.",
        )}
        {field(
          "password",
          "CBMS API password",
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="ird-password"
              type="password"
              autoComplete="new-password"
              className="pl-8"
              placeholder={settings?.hasPassword ? "Stored — leave empty to keep" : ""}
              value={draft.password}
              disabled={!canEdit}
              aria-invalid={Boolean(shown.password)}
              onChange={(e) => set({ password: e.target.value })}
            />
          </div>,
          "Stored encrypted; never shown again.",
        )}
        {field(
          "threshold",
          "Abbreviated tax invoice limit (NPR)",
          <Input
            id="ird-threshold"
            type="number"
            min={0}
            step="0.01"
            value={draft.threshold}
            disabled={!canEdit}
            aria-invalid={Boolean(shown.threshold)}
            onChange={(e) => set({ threshold: e.target.value })}
          />,
          "Bills up to this amount without a buyer PAN print as an Abbreviated Tax Invoice.",
        )}
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            <Save className="h-4 w-4" aria-hidden />
            {update.isPending ? "Saving…" : "Save IRD settings"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You need the “Manage IRD E-Billing Settings” permission to change these.</p>
      )}
    </div>
  )
}
