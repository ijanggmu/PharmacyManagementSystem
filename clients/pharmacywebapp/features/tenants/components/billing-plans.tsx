"use client"

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Pagination } from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle2, Layers, Pencil, Plus, XCircle } from "lucide-react"
import { tenantsApi } from "@/features/tenants/api-client"
import { QUOTA_RESOURCES, type BillingPlan, type QuotaResource } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"

function errorMessage(error: unknown): string {
  return error instanceof DotnetApiError ? error.normalized.message : "Request failed"
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

type PlanForm = {
  key: string
  name: string
  currency: string
  monthlyBasePrice: string
  annualPrice: string
  interval: "Monthly" | "Yearly"
  overageRates: Record<QuotaResource, string>
}

const EMPTY_OVERAGE: Record<QuotaResource, string> = {
  ApiCalls: "",
  StorageBytes: "",
  Users: "",
  ActiveFeatureFlags: "",
}

const EMPTY_FORM: PlanForm = {
  key: "",
  name: "",
  currency: "USD",
  monthlyBasePrice: "",
  annualPrice: "",
  interval: "Monthly",
  overageRates: { ...EMPTY_OVERAGE },
}

function toForm(plan: BillingPlan): PlanForm {
  const overageRates = { ...EMPTY_OVERAGE }
  for (const resource of QUOTA_RESOURCES) {
    const value = plan.overageRates[resource]
    if (value !== undefined) overageRates[resource] = String(value)
  }
  return {
    key: plan.key,
    name: plan.name,
    currency: plan.currency,
    monthlyBasePrice: String(plan.monthlyBasePrice),
    annualPrice: plan.annualPrice != null ? String(plan.annualPrice) : "",
    interval: plan.interval === "Yearly" || plan.interval === 1 ? "Yearly" : "Monthly",
    overageRates,
  }
}

function buildOverageRates(form: PlanForm): Partial<Record<QuotaResource, number>> | undefined {
  const result: Partial<Record<QuotaResource, number>> = {}
  for (const resource of QUOTA_RESOURCES) {
    const raw = form.overageRates[resource].trim()
    if (raw === "") continue
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) result[resource] = parsed
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const RESOURCE_LABELS: Record<QuotaResource, string> = {
  ApiCalls: "API calls",
  StorageBytes: "Storage (bytes)",
  Users: "Users",
  ActiveFeatureFlags: "Active feature flags",
}

const PAGE_SIZE = 10

export function BillingPlans() {
  const [plans, setPlans] = useState<BillingPlan[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [includeInactive, setIncludeInactive] = useState(true)
  const [pageNumber, setPageNumber] = useState(1)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<BillingPlan | null>(null)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setPlans(await tenantsApi.listPlans(includeInactive))
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => setPageNumber(1), [includeInactive])

  // Stay in range when a reload leaves fewer pages than before.
  const planPages = Math.max(1, Math.ceil((plans?.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(pageNumber, planPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE

  const openCreate = () => {
    setEditingPlan(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (plan: BillingPlan) => {
    setEditingPlan(plan)
    setForm(toForm(plan))
    setFormError(null)
    setDialogOpen(true)
  }

  const updateField = (field: keyof Omit<PlanForm, "overageRates">) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  const updateOverage = (resource: QuotaResource) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, overageRates: { ...current.overageRates, [resource]: event.target.value } }))

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const monthlyBasePrice = Number(form.monthlyBasePrice)
    if (!form.name.trim()) return setFormError("Enter a plan name.")
    if (!editingPlan && !/^[a-z0-9-]{1,64}$/.test(form.key.trim())) {
      return setFormError("Plan key: 1-64 lowercase letters, digits or hyphens.")
    }
    if (!Number.isFinite(monthlyBasePrice) || monthlyBasePrice < 0) return setFormError("Enter a valid monthly price.")
    const annualPrice = form.annualPrice.trim() === "" ? null : Number(form.annualPrice)
    if (annualPrice !== null && (!Number.isFinite(annualPrice) || annualPrice < 0)) {
      return setFormError("Enter a valid annual price, or leave it blank.")
    }

    setSubmitting(true)
    try {
      if (editingPlan) {
        await tenantsApi.updatePlan(editingPlan.id, {
          name: form.name.trim(),
          monthlyBasePrice,
          overageRates: buildOverageRates(form),
          interval: form.interval,
          annualPrice,
        })
      } else {
        await tenantsApi.createPlan({
          key: form.key.trim().toLowerCase(),
          name: form.name.trim(),
          currency: form.currency.trim().toUpperCase() || "USD",
          monthlyBasePrice,
          overageRates: buildOverageRates(form),
          interval: form.interval,
          annualPrice,
        })
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="font-display text-base">Billing plans</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Monthly/annual pricing and overage rates per plan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} aria-label="Include inactive plans" />
            Include inactive
          </label>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus aria-hidden />
            New plan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !plans ? (
          <SkeletonTable rows={4} cols={6} />
        ) : loadError && !plans ? (
          <ErrorState size="compact" title="Couldn't load plans" message={loadError} onRetry={() => void load()} />
        ) : !plans || plans.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Layers}
            title="No billing plans yet"
            description="Create a plan to start assigning tenants to it."
            action={{ label: "New plan", onClick: openCreate, icon: Plus }}
          />
        ) : (
          <>
            {loadError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead className="text-right">Annual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.slice(startIndex, startIndex + PAGE_SIZE).map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-mono text-xs">{plan.key}</TableCell>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{plan.interval === "Yearly" || plan.interval === 1 ? "Yearly" : "Monthly"}</TableCell>
                      <TableCell className="num text-right">{formatMoney(plan.monthlyBasePrice, plan.currency)}</TableCell>
                      <TableCell className="num text-right">
                        {plan.annualPrice != null ? formatMoney(plan.annualPrice, plan.currency) : "—"}
                      </TableCell>
                      <TableCell>
                        {plan.isActive ? (
                          <Badge variant="success">
                            <CheckCircle2 aria-hidden />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="muted">
                            <XCircle aria-hidden />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} aria-label={`Edit ${plan.name}`}>
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={planPages}
              totalItems={plans.length}
              itemsPerPage={PAGE_SIZE}
              startIndex={startIndex}
              onPageChange={setPageNumber}
              className="mt-4"
            />
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => (submitting ? null : setDialogOpen(open))}>
        <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
          <DialogHeader>
            <DialogTitle>{editingPlan ? `Edit ${editingPlan.name}` : "New billing plan"}</DialogTitle>
            <DialogDescription>
              {editingPlan
                ? "Update pricing and overage rates. The plan key can't be changed."
                : "Create a plan tenants can be assigned to."}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="plan-key">
                  Plan key {!editingPlan && <span className="text-destructive" aria-hidden>*</span>}
                </Label>
                <Input
                  id="plan-key"
                  value={form.key}
                  onChange={updateField("key")}
                  placeholder="pro"
                  autoComplete="off"
                  className="font-mono"
                  disabled={!!editingPlan}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-name">
                  Name <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Input id="plan-name" value={form.name} onChange={updateField("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-currency">Currency</Label>
                <Input
                  id="plan-currency"
                  value={form.currency}
                  onChange={updateField("currency")}
                  placeholder="USD"
                  className="font-mono uppercase"
                  disabled={!!editingPlan}
                  maxLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-interval">Interval</Label>
                <Select value={form.interval} onValueChange={(value: "Monthly" | "Yearly") => setForm((c) => ({ ...c, interval: value }))}>
                  <SelectTrigger id="plan-interval" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-monthly">
                  Monthly price <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Input id="plan-monthly" type="number" min="0" step="0.01" value={form.monthlyBasePrice} onChange={updateField("monthlyBasePrice")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-annual">Annual price (optional)</Label>
                <Input id="plan-annual" type="number" min="0" step="0.01" value={form.annualPrice} onChange={updateField("annualPrice")} />
              </div>
            </div>

            <fieldset className="space-y-3 border-t pt-4">
              <legend className="mb-1 text-sm font-semibold text-foreground">Overage rates (optional)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {QUOTA_RESOURCES.map((resource) => (
                  <div key={resource} className="space-y-2">
                    <Label htmlFor={`overage-${resource}`}>{RESOURCE_LABELS[resource]}</Label>
                    <Input
                      id={`overage-${resource}`}
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.overageRates[resource]}
                      onChange={updateOverage(resource)}
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting} loadingText="Saving…">
                {editingPlan ? "Save changes" : "Create plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
