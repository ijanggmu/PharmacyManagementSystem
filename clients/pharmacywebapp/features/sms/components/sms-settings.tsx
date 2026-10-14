"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { AlertTriangle, KeyRound, ListChecks, Moon, Save, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  SMS_PROVIDER_LABELS,
  SMS_PROVIDERS,
  toSmsSettingsInput,
  type SmsProvider,
  type SmsSettings,
  type SmsSettingsInput,
} from "@/features/sms/api-client"
import { useSendTestSms, useSmsSettings, useUpdateSmsSettings } from "@/features/sms/hooks/use-sms"
import { validateSmsSettingsInput, type SmsFieldErrors as FieldErrors } from "@/features/sms/lib/sms-settings-form"
import { countSms, describeSms } from "@/features/sms/lib/sms-segments"
import {
  SMS_LANGUAGE_LABELS,
  SMS_LANGUAGES,
  SMS_PLACEHOLDERS,
  SMS_TEMPLATE_KINDS,
  SMS_TEMPLATE_LABELS,
  normalizeNepaliMobile,
  renderSmsTemplate,
  sampleValues,
  templateError,
  type SmsLanguage,
} from "@/features/sms/lib/sms-template"

const HOURS = Array.from({ length: 24 }, (_, h) => h)

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`
}

/**
 * SMS settings: the gateway (Sparrow / Aakash, or log-only for testing), its token (stored encrypted, never shown
 * again), sender ID, the automatic reminders, quiet hours, the hourly limit and the message templates with a live
 * preview and SMS-part counter.
 */
export default function SmsSettingsPanel({ canEdit, canViewLog = false }: { canEdit: boolean; canViewLog?: boolean }) {
  const { toast } = useToast()
  const query = useSmsSettings()
  const update = useUpdateSmsSettings()
  const sendTest = useSendTestSms()
  const [draft, setDraft] = useState<SmsSettingsInput | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [templateLanguage, setTemplateLanguage] = useState<SmsLanguage>("en")
  const [testPhone, setTestPhone] = useState("")

  useEffect(() => {
    if (query.data) {
      setDraft(toSmsSettingsInput(query.data))
      setTemplateLanguage(query.data.defaultLanguage)
    }
  }, [query.data])

  if (query.isLoading || (!draft && !query.isError)) return <Skeleton className="h-96 w-full" />
  if (query.isError || !draft) {
    return (
      <ErrorState
        size="compact"
        title="Couldn't load SMS settings"
        message={apiRequestErrorMessage(query.error) || "Failed to load the SMS settings."}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    )
  }

  const settings: SmsSettings | undefined = query.data
  const errors = validateSmsSettingsInput(draft, settings?.hasApiToken ?? false)
  const templateErrors = draft.templates.map((t) => templateError(t.kind, t.body))
  const shown = submitted ? errors : {}
  const set = (patch: Partial<SmsSettingsInput>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setTemplate = (index: number, body: string) =>
    setDraft((d) => (d ? { ...d, templates: d.templates.map((t, i) => (i === index ? { ...t, body } : t)) } : d))

  const save = () => {
    setSubmitted(true)
    if (Object.keys(errors).length > 0 || templateErrors.some(Boolean)) return
    update.mutate(draft, {
      onSuccess: () => {
        setSubmitted(false)
        toast({ title: "SMS settings saved" })
      },
      onError: (error) =>
        toast({ title: "Couldn't save SMS settings", description: apiRequestErrorMessage(error) || error.message, variant: "destructive" }),
    })
  }

  const runTest = () => {
    const phone = normalizeNepaliMobile(testPhone)
    if (!phone) {
      toast({ title: "Enter a 10-digit mobile number", description: "98…, 97… or 96…", variant: "destructive" })
      return
    }
    sendTest.mutate(phone, {
      onSuccess: () => toast({ title: "Test SMS queued", description: "Check the SMS log for the gateway's answer." }),
      onError: (error) =>
        toast({ title: "Couldn't send the test SMS", description: apiRequestErrorMessage(error) || error.message, variant: "destructive" }),
    })
  }

  const field = (id: keyof FieldErrors | string, label: string, input: ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sms-${id}`}>{label}</Label>
      {input}
      {shown[id as keyof FieldErrors] ? (
        <p role="alert" className="flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {shown[id as keyof FieldErrors]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )

  const toggle = (id: string, title: string, description: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="space-y-0.5 text-sm">
        <Label htmlFor={`sms-${id}`} className="font-medium text-foreground">
          {title}
        </Label>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Switch id={`sms-${id}`} checked={checked} disabled={!canEdit} onCheckedChange={onChange} />
    </div>
  )

  const sample = sampleValues(templateLanguage, draft.pharmacyName)

  return (
    <div className="space-y-6">
      {toggle(
        "enabled",
        "Send SMS to customers",
        "Dues reminders, refill reminders and receipts go out through your SMS provider.",
        draft.enabled,
        (enabled) => set({ enabled }),
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Provider</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "provider",
            "SMS provider",
            <Select value={draft.provider} disabled={!canEdit} onValueChange={(v) => set({ provider: v as SmsProvider })}>
              <SelectTrigger id="sms-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {SMS_PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
            draft.provider === "LogOnly" ? "Messages are only written to the server log — use while testing." : undefined,
          )}
          {field(
            "apiToken",
            "API token",
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="sms-apiToken"
                type="password"
                autoComplete="new-password"
                className="pl-8"
                placeholder={settings?.hasApiToken ? "Stored — leave empty to keep" : ""}
                value={draft.apiToken}
                disabled={!canEdit || draft.provider === "LogOnly"}
                aria-invalid={Boolean(shown.apiToken)}
                onChange={(e) => set({ apiToken: e.target.value })}
              />
            </div>,
            "From your Sparrow / Aakash dashboard. Stored encrypted; never shown again.",
          )}
          {field(
            "senderId",
            "Sender ID",
            <Input
              id="sms-senderId"
              maxLength={32}
              value={draft.senderId}
              disabled={!canEdit || draft.provider !== "Sparrow"}
              aria-invalid={Boolean(shown.senderId)}
              onChange={(e) => set({ senderId: e.target.value })}
            />,
            draft.provider === "Aakash" ? "Aakash sends with the sender name on your account." : "The identity Sparrow approved for you.",
          )}
          {field(
            "pharmacyName",
            "Pharmacy name in messages",
            <Input
              id="sms-pharmacyName"
              maxLength={80}
              placeholder="Your pharmacy's name"
              value={draft.pharmacyName}
              disabled={!canEdit}
              onChange={(e) => set({ pharmacyName: e.target.value })}
            />,
            "What {pharmacy} shows. Short names keep messages to one SMS.",
          )}
          {field(
            "defaultLanguage",
            "Message language",
            <Select value={draft.defaultLanguage} disabled={!canEdit} onValueChange={(v) => set({ defaultLanguage: v as SmsLanguage })}>
              <SelectTrigger id="sms-defaultLanguage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {SMS_LANGUAGE_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
            "Nepali messages are Unicode: 70 characters per SMS instead of 160.",
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Automatic messages</h3>
        {toggle(
          "receipts",
          "SMS receipts",
          "Lets the cashier tick “SMS receipt” at checkout to text the bill number and total.",
          draft.receiptsEnabled,
          (receiptsEnabled) => set({ receiptsEnabled }),
        )}
        {toggle(
          "autoDues",
          "Automatic dues reminders",
          `Every morning, customers who agreed to SMS get one reminder for invoices overdue by ${draft.duesReminderDays} days or more — at most once per invoice every ${draft.duesReminderDays} days.`,
          draft.autoDuesReminders,
          (autoDuesReminders) => set({ autoDuesReminders }),
        )}
        {toggle(
          "autoRefill",
          "Refill reminders",
          "Every morning, customers who agreed to SMS hear when a prescription refill is due (at most weekly per prescription).",
          draft.autoRefillReminders,
          (autoRefillReminders) => set({ autoRefillReminders }),
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            "duesReminderDays",
            "Remind after (days overdue)",
            <Input
              id="sms-duesReminderDays"
              type="number"
              min={1}
              max={365}
              value={draft.duesReminderDays}
              disabled={!canEdit}
              aria-invalid={Boolean(shown.duesReminderDays)}
              onChange={(e) => set({ duesReminderDays: Number(e.target.value) })}
            />,
          )}
          {field(
            "refillReminderDays",
            "Refill window (days)",
            <Input
              id="sms-refillReminderDays"
              type="number"
              min={0}
              max={60}
              value={draft.refillReminderDays}
              disabled={!canEdit}
              aria-invalid={Boolean(shown.refillReminderDays)}
              onChange={(e) => set({ refillReminderDays: Number(e.target.value) })}
            />,
            "Prescriptions expiring within this many days.",
          )}
          {field(
            "maxPerHour",
            "Most SMS per hour",
            <Input
              id="sms-maxPerHour"
              type="number"
              min={1}
              max={10000}
              value={draft.maxPerHour}
              disabled={!canEdit}
              aria-invalid={Boolean(shown.maxPerHour)}
              onChange={(e) => set({ maxPerHour: Number(e.target.value) })}
            />,
            "The rest wait for the next hour.",
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4 rounded-lg border p-3">
          <Moon className="mb-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          {field(
            "quietStart",
            "Quiet from",
            <Select value={String(draft.quietHoursStart)} disabled={!canEdit} onValueChange={(v) => set({ quietHoursStart: Number(v) })}>
              <SelectTrigger id="sms-quietStart" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}
          {field(
            "quietEnd",
            "until",
            <Select value={String(draft.quietHoursEnd)} disabled={!canEdit} onValueChange={(v) => set({ quietHoursEnd: Number(v) })}>
              <SelectTrigger id="sms-quietEnd" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}
          <p className="mb-2 text-xs text-muted-foreground">
            Nepal time. Reminders wait until quiet hours end; receipts go out at any hour. Same start and end = no quiet hours.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Templates</h3>
          <div className="flex gap-1" role="group" aria-label="Template language">
            {SMS_LANGUAGES.map((l) => (
              <Button
                key={l}
                type="button"
                size="sm"
                variant={templateLanguage === l ? "default" : "outline"}
                onClick={() => setTemplateLanguage(l)}
              >
                {SMS_LANGUAGE_LABELS[l]}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Placeholders: {SMS_PLACEHOLDERS.join(" ")}. Refill reminders must keep the STOP opt-out line.
        </p>
        {SMS_TEMPLATE_KINDS.map((kind) => {
          const index = draft.templates.findIndex((t) => t.kind === kind && t.language === templateLanguage)
          if (index < 0) return null
          const body = draft.templates[index].body
          const preview = renderSmsTemplate(body, sample)
          const size = countSms(preview)
          const error = submitted ? templateErrors[index] : null
          return (
            <div key={`${kind}-${templateLanguage}`} className="space-y-1.5">
              <Label htmlFor={`sms-template-${kind}`}>{SMS_TEMPLATE_LABELS[kind]}</Label>
              <Textarea
                id={`sms-template-${kind}`}
                rows={3}
                value={body}
                disabled={!canEdit}
                aria-invalid={Boolean(error)}
                onChange={(e) => setTemplate(index, e.target.value)}
              />
              <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                <p className="min-w-0 flex-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Preview: </span>
                  {preview}
                </p>
                <span className={size.segments > 2 ? "num font-medium text-warning" : "num text-muted-foreground"}>
                  {describeSms(size)}
                </span>
              </div>
              {error ? (
                <p role="alert" className="flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}
            </div>
          )
        })}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="sms-test-phone">Send a test SMS to</Label>
            <Input
              id="sms-test-phone"
              inputMode="tel"
              placeholder="98XXXXXXXX"
              className="w-44"
              value={testPhone}
              disabled={!canEdit}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={runTest} disabled={!canEdit || sendTest.isPending || !settings?.updatedAtUtc}>
            <Send className="h-4 w-4" aria-hidden />
            {sendTest.isPending ? "Sending…" : "Send test"}
          </Button>
          {canViewLog && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/settings/sms-log">
                <ListChecks className="h-4 w-4" aria-hidden />
                SMS log
              </Link>
            </Button>
          )}
        </div>
        {canEdit ? (
          <Button onClick={save} disabled={update.isPending}>
            <Save className="h-4 w-4" aria-hidden />
            {update.isPending ? "Saving…" : "Save SMS settings"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">You need permission to change settings to edit these.</p>
        )}
      </div>
    </div>
  )
}
