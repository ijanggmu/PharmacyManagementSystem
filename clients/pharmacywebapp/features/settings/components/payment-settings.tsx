"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, CheckCircle2, ImageUp, Info, KeyRound, Landmark, Lock, QrCode, RefreshCw, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { usePaymentSettings, useUpdatePaymentSettings } from "@/features/settings/hooks/use-payment-settings"
import {
  emptyPaymentSettings,
  isAllowedQrDataUrl,
  MAX_QR_DATA_URL_LENGTH,
  toPaymentSettingsInput,
  validatePaymentSettingsInput,
  validateQrImageFile,
  type FonepayEnvironment,
  type PaymentSettingsErrors,
  type PaymentSettingsInput,
} from "@/lib/api/payment-settings-api"

const MAX_QR_DIMENSION = 800

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't read the image."))
    reader.readAsDataURL(file)
  })
}

/** Reads a QR image, downscaling anything larger than 800 px on its long side. */
async function prepareQrImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("That file isn't a readable image."))
    img.src = original
  })
  const longSide = Math.max(img.naturalWidth, img.naturalHeight)
  if (longSide <= MAX_QR_DIMENSION && original.length <= MAX_QR_DATA_URL_LENGTH) return original

  const scale = Math.min(1, MAX_QR_DIMENSION / longSide)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return original
  // QR codes need crisp modules: no smoothing, white background for transparent PNGs.
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const type = file.type === "image/jpeg" ? "image/jpeg" : file.type === "image/webp" ? "image/webp" : "image/png"
  return canvas.toDataURL(type, 0.92)
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="flex items-center gap-1 text-xs font-medium text-destructive" role="alert">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      Saved
    </span>
  )
}

function SectionCard({
  icon,
  title,
  description,
  enabled,
  onToggle,
  switchId,
  disabled,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  enabled: boolean
  onToggle: (value: boolean) => void
  switchId: string
  disabled: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border" aria-labelledby={`${switchId}-title`}>
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
            {icon}
          </span>
          <div>
            <h3 id={`${switchId}-title`} className="font-display text-base font-semibold">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <label htmlFor={switchId} className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
          <span className={cn(enabled ? "text-success" : "text-muted-foreground")}>{enabled ? "On" : "Off"}</span>
          <Switch id={switchId} checked={enabled} onCheckedChange={onToggle} disabled={disabled} aria-label={`Enable ${title}`} />
        </label>
      </div>
      <div className={cn("space-y-4 p-4 transition-opacity duration-200", !enabled && "opacity-60")}>{children}</div>
    </section>
  )
}

/** Tab trigger for one payment method: label, live on/off dot, and an error marker. */
function MethodTab({
  value,
  label,
  icon,
  enabled,
  hasError,
}: {
  value: string
  label: string
  icon: ReactNode
  enabled: boolean
  hasError: boolean
}) {
  return (
    <TabsTrigger value={value} className="gap-2 px-3">
      {icon}
      {label}
      {hasError ? (
        <AlertTriangle className="size-3.5 text-destructive" aria-label="Has errors" />
      ) : (
        <span
          className={cn("size-1.5 rounded-full", enabled ? "bg-success" : "bg-muted-foreground/40")}
          aria-label={enabled ? "On" : "Off"}
          role="img"
        />
      )}
    </TabsTrigger>
  )
}

export default function PaymentSettings({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast()
  const query = usePaymentSettings()
  const update = useUpdatePaymentSettings()
  const [form, setForm] = useState<PaymentSettingsInput>(() => toPaymentSettingsInput(emptyPaymentSettings()))
  const [errors, setErrors] = useState<PaymentSettingsErrors>({})
  const [imageBusy, setImageBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const saved = query.data ?? null
  const unavailable = query.isSuccess && saved === null
  const readOnly = !canEdit || unavailable

  useEffect(() => {
    if (query.data) setForm(toPaymentSettingsInput(query.data))
  }, [query.data])

  const set = <K extends keyof PaymentSettingsInput>(key: K, value: PaymentSettingsInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const onPickImage = async (file: File | undefined) => {
    if (!file) return
    const problem = validateQrImageFile(file)
    if (problem) {
      setErrors((prev) => ({ ...prev, bankQrImage: problem }))
      return
    }
    setImageBusy(true)
    try {
      const dataUrl = await prepareQrImage(file)
      if (!isAllowedQrDataUrl(dataUrl)) {
        setErrors((prev) => ({ ...prev, bankQrImage: "The image is still too large after resizing. Try a smaller or cropped QR." }))
        return
      }
      set("bankQrImage", dataUrl)
    } catch (error) {
      setErrors((prev) => ({ ...prev, bankQrImage: error instanceof Error ? error.message : "Couldn't read the image." }))
    } finally {
      setImageBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const onSave = () => {
    const found = validatePaymentSettingsInput(form, saved ?? undefined)
    setErrors(found)
    if (Object.values(found).some(Boolean)) {
      toast({ title: "Check the highlighted fields", description: "Some payment settings need attention.", variant: "destructive" })
      return
    }
    update.mutate(form, {
      onSuccess: (next) => {
        setForm(toPaymentSettingsInput(next))
        toast({ title: "Payment settings saved", description: "The POS will use these QR options for new sales." })
      },
      onError: (error) =>
        toast({ title: "Couldn't save payment settings", description: error.message, variant: "destructive" }),
    })
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">Loading payment settings</span>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Couldn&apos;t load payment settings. {query.error.message}
        </p>
        <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()} loading={query.isFetching}>
          <RefreshCw aria-hidden />
          Try again
        </Button>
      </div>
    )
  }

  const err = (key: keyof PaymentSettingsInput) => errors[key]
  const hasErrors = (prefix: "bank" | "fonepay") =>
    Object.entries(errors).some(([key, message]) => key.startsWith(prefix) && Boolean(message))
  const describedBy = (key: keyof PaymentSettingsInput, help?: string) =>
    [help, errors[key] ? `${key}-error` : undefined].filter(Boolean).join(" ") || undefined

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!readOnly) onSave()
      }}
      noValidate
    >
      {unavailable ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning" role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Payment settings aren&apos;t available on the server yet. QR payments stay off until the API is updated.
        </p>
      ) : !canEdit ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          You can view these settings. Changing them needs the Settings update permission.
        </p>
      ) : null}

      <fieldset disabled={readOnly} className="min-w-0">
        {/* One tab per payment method. Both panels stay mounted (forceMount) so a validation error
            on the hidden tab still blocks save and its field can take focus. */}
        <Tabs defaultValue="bank" className="gap-4">
          <TabsList className="w-full sm:w-fit">
            <MethodTab value="bank" label="Bank / static QR" icon={<Landmark aria-hidden />} enabled={form.bankQrEnabled} hasError={hasErrors("bank")} />
            <MethodTab value="fonepay" label="Fonepay dynamic QR" icon={<QrCode aria-hidden />} enabled={form.fonepayEnabled} hasError={hasErrors("fonepay")} />
          </TabsList>
          <TabsContent value="bank" forceMount className="data-[state=inactive]:hidden">
        <SectionCard
          icon={<Landmark className="h-[18px] w-[18px]" />}
          title="Bank / static QR"
          description="Your printed bank or Fonepay merchant QR. Shown at the counter for Bank payments; the cashier confirms the transfer manually."
          enabled={form.bankQrEnabled}
          onToggle={(v) => set("bankQrEnabled", v)}
          switchId="bank-qr-enabled"
          disabled={readOnly}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bank-name">Bank name</Label>
              <Input id="bank-name" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="e.g. Nabil Bank" className="h-11" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Account name</Label>
              <Input
                id="account-name"
                value={form.accountName}
                onChange={(e) => set("accountName", e.target.value)}
                placeholder="As printed on the QR"
                className="h-11"
                maxLength={100}
                aria-invalid={Boolean(err("accountName")) || undefined}
                aria-describedby={describedBy("accountName")}
              />
              <FieldError id="accountName-error" message={err("accountName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-number">Account number</Label>
              <Input
                id="account-number"
                value={form.accountNumber}
                onChange={(e) => set("accountNumber", e.target.value)}
                placeholder="Optional"
                className="num h-11"
                inputMode="numeric"
                maxLength={40}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-qr-file">QR image</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div
                className={cn(
                  "flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white",
                  !form.bankQrImage && "border-dashed bg-muted/40",
                  err("bankQrImage") && "border-destructive",
                )}
              >
                {form.bankQrImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                  <img src={form.bankQrImage} alt="Bank QR preview" className="h-full w-full object-contain p-1" />
                ) : (
                  <QrCode className="h-10 w-10 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  id="bank-qr-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => void onPickImage(e.target.files?.[0])}
                  aria-describedby={describedBy("bankQrImage", "bank-qr-help")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => fileRef.current?.click()}
                    loading={imageBusy}
                    loadingText="Preparing…"
                  >
                    <ImageUp aria-hidden />
                    {form.bankQrImage ? "Replace image" : "Upload QR image"}
                  </Button>
                  {form.bankQrImage ? (
                    <Button type="button" variant="ghost" className="min-h-11 text-destructive hover:text-destructive" onClick={() => set("bankQrImage", null)}>
                      <Trash2 aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p id="bank-qr-help" className="text-xs text-muted-foreground">
                  PNG, JPEG or WebP up to 500 KB. Large images are resized to 800 px. Crop to just the QR for faster scans.
                </p>
                <FieldError id="bankQrImage-error" message={err("bankQrImage")} />
              </div>
            </div>
          </div>
        </SectionCard>
          </TabsContent>

          <TabsContent value="fonepay" forceMount className="data-[state=inactive]:hidden">
        <SectionCard
          icon={<QrCode className="h-[18px] w-[18px]" />}
          title="Fonepay dynamic QR"
          description="Generates a QR with the exact bill amount for each Fonepay payment and confirms it automatically."
          enabled={form.fonepayEnabled}
          onToggle={(v) => set("fonepayEnabled", v)}
          switchId="fonepay-enabled"
          disabled={readOnly}
        >
          <p className="flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-xs text-info">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Merchant code, API username, password and secret key come from Fonepay when your merchant account is onboarded
            for dynamic QR. Use Dev with Fonepay&apos;s test credentials first, then switch to Live.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="fonepay-merchant">Merchant code</Label>
              <Input
                id="fonepay-merchant"
                value={form.fonepayMerchantCode}
                onChange={(e) => set("fonepayMerchantCode", e.target.value)}
                className="h-11 font-mono"
                autoComplete="off"
                maxLength={60}
                aria-invalid={Boolean(err("fonepayMerchantCode")) || undefined}
                aria-describedby={describedBy("fonepayMerchantCode")}
              />
              <FieldError id="fonepayMerchantCode-error" message={err("fonepayMerchantCode")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fonepay-username">API username</Label>
              <Input
                id="fonepay-username"
                value={form.fonepayUsername}
                onChange={(e) => set("fonepayUsername", e.target.value)}
                className="h-11"
                autoComplete="off"
                maxLength={100}
                aria-invalid={Boolean(err("fonepayUsername")) || undefined}
                aria-describedby={describedBy("fonepayUsername")}
              />
              <FieldError id="fonepayUsername-error" message={err("fonepayUsername")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fonepay-env">Environment</Label>
              <Select value={form.fonepayEnvironment} onValueChange={(v) => set("fonepayEnvironment", v as FonepayEnvironment)} disabled={readOnly}>
                <SelectTrigger id="fonepay-env" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dev" className="min-h-11">
                    Dev (testing)
                  </SelectItem>
                  <SelectItem value="live" className="min-h-11">
                    Live (real payments)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fonepay-password" className="flex items-center gap-2">
                API password <SavedBadge show={Boolean(saved?.fonepayHasPassword)} />
              </Label>
              <Input
                id="fonepay-password"
                type="password"
                value={form.fonepayPassword}
                onChange={(e) => set("fonepayPassword", e.target.value)}
                className="h-11"
                autoComplete="new-password"
                placeholder={saved?.fonepayHasPassword ? "Leave blank to keep the saved password" : "Enter the API password"}
                aria-invalid={Boolean(err("fonepayPassword")) || undefined}
                aria-describedby={describedBy("fonepayPassword", "fonepay-secret-help")}
              />
              <FieldError id="fonepayPassword-error" message={err("fonepayPassword")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fonepay-secret" className="flex items-center gap-2">
                Secret key <SavedBadge show={Boolean(saved?.fonepayHasSecret)} />
              </Label>
              <Input
                id="fonepay-secret"
                type="password"
                value={form.fonepaySecretKey}
                onChange={(e) => set("fonepaySecretKey", e.target.value)}
                className="h-11 font-mono"
                autoComplete="new-password"
                placeholder={saved?.fonepayHasSecret ? "Leave blank to keep the saved key" : "Enter the secret key"}
                aria-invalid={Boolean(err("fonepaySecretKey")) || undefined}
                aria-describedby={describedBy("fonepaySecretKey", "fonepay-secret-help")}
              />
              <FieldError id="fonepaySecretKey-error" message={err("fonepaySecretKey")} />
            </div>
          </div>
          <p id="fonepay-secret-help" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Password and secret key are write-only: they are stored on the server and never shown again.
          </p>
        </SectionCard>
          </TabsContent>
        </Tabs>
      </fieldset>

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" className="min-h-11" loading={update.isPending} loadingText="Saving…">
            <Save aria-hidden />
            Save payment settings
          </Button>
        </div>
      ) : null}
    </form>
  )
}
