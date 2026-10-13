"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoyaltySettingsCard } from "@/features/settings/components/loyalty-settings-card"
import { InternalControlsCard } from "@/features/settings/components/internal-controls-card"
import { PriceLevelsCard } from "@/features/settings/components/price-levels-card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, ShieldAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCurrency, SUPPORTED_CURRENCIES } from "@/lib/contexts/currency-context"
import { settingsApi } from "@/features/settings/api-client"
import { useUpdateVatRate, useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { validateVatRatePercent } from "@/lib/api/pharmacy-settings-api"
import {
  DEFAULT_INVOICE_PAPER,
  INVOICE_PAPER_FORMATS,
  INVOICE_PAPER_SETTING_KEY,
  isInvoicePaperFormat,
} from "@/features/sales/lib/invoice-print"
import {
  SYSTEM_SECTIONS,
  isFormDirty,
  parseSystemSection,
  parseVatRateInput,
  systemSectionHref,
  vatRateToInput,
  type SystemSectionId,
  type SystemSettingsForm,
} from "@/features/settings/lib/system-settings-form"

const LOCAL_STORAGE_KEY = "pharmacy-settings"
const PERMISSION_MESSAGE = "Your role doesn't have permission to change system settings. Ask an admin to update this."

const DEFAULT_FORM: SystemSettingsForm = {
  pharmacyName: "PharmaCare Pharmacy",
  pharmacyAddress: "123 Main Street, Healthcare City, HC 12345",
  pharmacyPhone: "+977-1-4XXXXXX",
  pharmacyEmail: "info@pharmacare.com",
  vatRate: "13",
  lowStockThreshold: "10",
  autoReorderEnabled: false,
  backupFrequency: "manual",
  receiptFooter: "Thank you for choosing PharmaCare!",
  invoicePaper: DEFAULT_INVOICE_PAPER,
}

/** Fields kept only in this browser (no backend setting reads them). */
type LocalFields = Pick<
  SystemSettingsForm,
  "pharmacyName" | "pharmacyAddress" | "pharmacyPhone" | "pharmacyEmail" | "lowStockThreshold"
>

function readLocalFields(): Partial<LocalFields> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}
    const record = parsed as Record<string, unknown>
    const out: Partial<LocalFields> = {}
    for (const key of ["pharmacyName", "pharmacyAddress", "pharmacyPhone", "pharmacyEmail", "lowStockThreshold"] as const) {
      if (typeof record[key] === "string") out[key] = record[key]
    }
    return out
  } catch {
    return {}
  }
}

function isPermissionError(error: unknown): boolean {
  if (error instanceof DotnetApiError && error.normalized.status === 403) return true
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /forbidden|permission/i.test(message)
}

export default function SystemSettings() {
  const { toast } = useToast()
  const { currentCurrency, setCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const vatRateQuery = useVatRate()
  const updateVatRate = useUpdateVatRate()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<SystemSettingsForm>(DEFAULT_FORM)
  const [loaded, setLoaded] = useState<SystemSettingsForm>(DEFAULT_FORM)
  const dirty = isFormDirty(form, loaded)

  const section = parseSystemSection(searchParams.get("section"))
  const handleSectionChange = (value: string) => {
    const next: SystemSectionId = parseSystemSection(value)
    router.replace(systemSectionHref(pathname, searchParams.toString(), next), { scroll: false })
  }

  const update = <K extends keyof SystemSettingsForm>(key: K, value: SystemSettingsForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  /** Applies values that just came from storage to both the form and the dirty-check baseline. */
  const applyLoaded = useCallback((patch: Partial<SystemSettingsForm>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setLoaded((prev) => ({ ...prev, ...patch }))
  }, [])

  useEffect(() => {
    applyLoaded(readLocalFields())
    // Tenant key/value settings: auto-reorder, backup reminder, receipt footer and invoice paper.
    void settingsApi.list().then(({ data, error }) => {
      if (error) return
      const byKey = new Map(data.map((row) => [row.key, row.value]))
      const patch: Partial<SystemSettingsForm> = {}
      const autoReorder = byKey.get("auto_reorder_enabled")
      if (autoReorder != null) patch.autoReorderEnabled = autoReorder === "true"
      const backup = byKey.get("pharmacy.backup_frequency")
      if (backup != null) patch.backupFrequency = backup
      const footer = byKey.get("pharmacy.receipt_footer")
      if (footer != null) patch.receiptFooter = footer
      const paper = byKey.get(INVOICE_PAPER_SETTING_KEY)
      if (isInvoicePaperFormat(paper)) patch.invoicePaper = paper
      applyLoaded(patch)
    })
  }, [applyLoaded])

  // The VAT rate lives in the .NET pharmacy settings (the rate sales and invoices use).
  const savedVatRate = vatRateQuery.data
  useEffect(() => {
    if (savedVatRate === undefined) return
    applyLoaded({ vatRate: vatRateToInput(savedVatRate) })
  }, [savedVatRate, applyLoaded])

  const showError = (error: unknown) => {
    toast({
      title: "Settings not saved",
      description: isPermissionError(error)
        ? PERMISSION_MESSAGE
        : error instanceof Error
          ? error.message
          : String(error),
      variant: "destructive",
    })
  }

  const handleSave = async () => {
    const vatRatePercent = parseVatRateInput(form.vatRate)
    const vatError = validateVatRatePercent(vatRatePercent)
    if (vatError) {
      toast({ title: "Settings not saved", description: vatError, variant: "destructive" })
      return
    }

    try {
      const local: LocalFields = {
        pharmacyName: form.pharmacyName,
        pharmacyAddress: form.pharmacyAddress,
        pharmacyPhone: form.pharmacyPhone,
        pharmacyEmail: form.pharmacyEmail,
        lowStockThreshold: form.lowStockThreshold,
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local))
    } catch {
      // Storage can be unavailable (private window); the server-backed fields still save.
    }

    const results = [
      await settingsApi.upsert("auto_reorder_enabled", String(form.autoReorderEnabled), "boolean"),
      await settingsApi.upsert("pharmacy.backup_frequency", form.backupFrequency),
      await settingsApi.upsert("pharmacy.receipt_footer", form.receiptFooter),
      await settingsApi.upsert(INVOICE_PAPER_SETTING_KEY, form.invoicePaper),
    ]
    // Surface the real outcome: these upserts are rejected (403) for roles without settings update.
    const firstError = results.find((r) => r.error)?.error
    if (firstError) {
      showError(firstError)
      return
    }

    if (savedVatRate === undefined || vatRatePercent !== savedVatRate) {
      try {
        await updateVatRate.mutateAsync(vatRatePercent)
      } catch (error) {
        showError(error)
        return
      }
    }

    // Other screens read these through the cached ["system-settings"] query.
    void queryClient.invalidateQueries({ queryKey: ["system-settings"] })
    setLoaded(form)

    toast({
      title: "Settings saved",
      description: "System settings have been updated successfully",
    })
  }

  const handleSaveClick = async () => {
    setSaving(true)
    try {
      await handleSave()
    } finally {
      setSaving(false)
    }
  }

  const handleCurrencyChange = (currencyCode: string) => {
    const selectedCurrency = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)
    if (selectedCurrency) {
      setCurrency(selectedCurrency)
      toast({
        title: "Currency updated",
        description: `Currency changed to ${selectedCurrency.name}`,
      })
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <Tabs value={section} onValueChange={handleSectionChange} className="gap-4">
        <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList
            aria-label="System settings sections"
            className="inline-flex h-auto w-max min-w-full justify-start gap-1 rounded-none border-b bg-transparent p-0"
          >
            {SYSTEM_SECTIONS.map((s) => (
              <TabsTrigger
                key={s.id}
                value={s.id}
                className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2 -mb-px data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent"
              >
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Pharmacy contact details</CardTitle>
              <CardDescription>Shown on receipts and customer-facing documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pharmacyName">Pharmacy name</Label>
                  <Input
                    id="pharmacyName"
                    value={form.pharmacyName}
                    onChange={(e) => update("pharmacyName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pharmacyPhone">Phone number</Label>
                  <Input
                    id="pharmacyPhone"
                    value={form.pharmacyPhone}
                    onChange={(e) => update("pharmacyPhone", e.target.value)}
                    placeholder="+977-1-4XXXXXX"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pharmacyAddress">Address</Label>
                <Textarea
                  id="pharmacyAddress"
                  value={form.pharmacyAddress}
                  onChange={(e) => update("pharmacyAddress", e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pharmacyEmail">Email address</Label>
                <Input
                  id="pharmacyEmail"
                  type="email"
                  value={form.pharmacyEmail}
                  onChange={(e) => update("pharmacyEmail", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Currency</CardTitle>
              <CardDescription>How amounts are displayed across the system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-sm space-y-2">
                <Label htmlFor="currency">Display currency</Label>
                <Select value={currentCurrency.code} onValueChange={handleCurrencyChange}>
                  <SelectTrigger id="currency" aria-describedby="currency-help">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.code} ({currency.symbol}) - {currency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="currency-help" className="text-xs text-muted-foreground">
                  Changes apply immediately on this device.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/5 p-4">
                <div>
                  <div className="text-lg font-semibold text-foreground">
                    {currentCurrency.code} ({currentCurrency.symbol})
                  </div>
                  <div className="text-sm text-muted-foreground">{currentCurrency.name}</div>
                </div>
                <div className="text-right">
                  <div className="num font-display text-2xl font-bold text-primary">{currentCurrency.symbol}1,234.56</div>
                  <div className="text-xs text-muted-foreground">Example format</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Tax and invoicing</CardTitle>
              <CardDescription>The VAT rate and what is printed on every invoice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs space-y-2">
                <Label htmlFor="vatRate">VAT rate (%)</Label>
                <Input
                  id="vatRate"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  className="num"
                  value={form.vatRate}
                  disabled={vatRateQuery.isLoading}
                  onChange={(e) => update("vatRate", e.target.value)}
                  aria-describedby="vatRate-help"
                />
                <p id="vatRate-help" className="text-xs text-muted-foreground">
                  Used at checkout and printed on invoices. Prices are VAT-inclusive.
                </p>
                {vatRateQuery.isError && (
                  <p role="alert" className="text-xs text-destructive">
                    Couldn&apos;t load the saved VAT rate. Saving will overwrite it with the value above.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="receiptFooter">Receipt footer message</Label>
                <Textarea
                  id="receiptFooter"
                  value={form.receiptFooter}
                  onChange={(e) => update("receiptFooter", e.target.value)}
                  rows={2}
                  aria-describedby="receiptFooter-help"
                />
                <p id="receiptFooter-help" className="text-xs text-muted-foreground">
                  Printed at the bottom of every invoice.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoicePaper">Invoice paper size</Label>
                <Select value={form.invoicePaper} onValueChange={(v) => isInvoicePaperFormat(v) && update("invoicePaper", v)}>
                  <SelectTrigger id="invoicePaper" className="w-full sm:w-72" aria-describedby="invoicePaper-help">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_PAPER_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label} · {f.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="invoicePaper-help" className="text-xs text-muted-foreground">
                  The default when printing. Cashiers can still switch paper in the print dialog.
                </p>
              </div>
            </CardContent>
          </Card>
          <LoyaltySettingsCard />
          <InternalControlsCard />
          <PriceLevelsCard />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Inventory</CardTitle>
              <CardDescription>Stock alerts and reordering preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="max-w-xs space-y-2">
                <Label htmlFor="lowStockThreshold">Low stock threshold</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  className="num"
                  value={form.lowStockThreshold}
                  onChange={(e) => update("lowStockThreshold", e.target.value)}
                  aria-describedby="lowStockThreshold-help"
                />
                <p id="lowStockThreshold-help" className="text-xs text-muted-foreground">
                  Default units below which an item is flagged.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="autoReorder">Auto reorder suggestions</Label>
                  <p id="autoReorder-help" className="text-sm text-muted-foreground">
                    Suggest reorders automatically when stock falls below the minimum
                  </p>
                </div>
                <Switch
                  id="autoReorder"
                  aria-describedby="autoReorder-help"
                  checked={form.autoReorderEnabled}
                  onCheckedChange={(checked) => update("autoReorderEnabled", checked)}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Alerts</CardTitle>
              <CardDescription>
                Low stock, expiry, and prescription reminders appear in the dashboard notification bell. Email and SMS
                delivery are not configured in this release.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Data protection</CardTitle>
              <CardDescription>
                Database backups are managed by your hosting provider. This preference only records how often you
                intend to request a manual export; it does not trigger backups itself. Export reports from Reports or
                Accounting modules for local archives.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="backupFrequency">Backup / export reminder frequency</Label>
                <Select value={form.backupFrequency} onValueChange={(value) => update("backupFrequency", value)}>
                  <SelectTrigger id="backupFrequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border"
                  aria-hidden
                >
                  <ShieldAlert className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <CardTitle className="font-display text-base">System logs</CardTitle>
                  <CardDescription>
                    Access log, integration log and email/SMS log — separate from the entity audit trail.
                  </CardDescription>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/dashboard/settings/system-logs">
                  <ShieldAlert aria-hidden />
                  View system logs
                </Link>
              </Button>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>

      {/* One Save for every section — sticky so it stays reachable on long sections */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <p className="mr-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {dirty ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
              <span className="font-medium text-foreground">Unsaved changes</span>
            </>
          ) : (
            <span>All changes saved. Currency changes apply instantly.</span>
          )}
        </p>
        <Button
          onClick={handleSaveClick}
          disabled={saving}
          loading={saving}
          loadingText="Saving…"
          className="min-w-32"
        >
          <Save aria-hidden />
          Save changes
        </Button>
      </div>
    </div>
  )
}
