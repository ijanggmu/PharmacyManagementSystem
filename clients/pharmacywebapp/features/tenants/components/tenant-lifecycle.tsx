"use client"

import { useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { nepalDayEndInclusiveUtc, nepalYmdOf } from "@/lib/utils/nepal-time"
import { Label } from "@/components/ui/label"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonCard } from "@/components/ui/skeleton"
import { AlertTriangle, CheckCircle2, Clock, Pause, Play, RotateCw, ShieldOff, XCircle } from "lucide-react"
import { tenantsApi } from "@/features/tenants/api-client"
import type { TenantProvisioningStatus, TenantStatus } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"

function errorMessage(error: unknown): string {
  return error instanceof DotnetApiError ? error.normalized.message : "Request failed"
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

/** The Nepal calendar day a valid-until instant falls on (it is stored as the end of that Nepal day). */
function toDateInputValue(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return nepalYmdOf(date)
}

function provisioningVariant(status: string): "success" | "warning" | "muted" | "danger" {
  const normalized = status.toLowerCase()
  if (normalized.includes("fail") || normalized.includes("error")) return "danger"
  if (normalized.includes("progress") || normalized.includes("running") || normalized.includes("pending")) return "warning"
  if (normalized.includes("complete") || normalized.includes("success")) return "success"
  return "muted"
}

type DialogKind = "renew" | "adjust" | null

/**
 * Operator-only tenant lifecycle actions: renew/change plan, adjust validity (no invoice,
 * root override), activate/deactivate, and provisioning status + retry.
 */
export function TenantLifecycle({ tenant, onTenantChanged }: { tenant: TenantStatus; onTenantChanged: () => void }) {
  const [provisioning, setProvisioning] = useState<TenantProvisioningStatus | null>(null)
  const [provisioningError, setProvisioningError] = useState<string | null>(null)
  const [provisioningLoading, setProvisioningLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)
  const [activationConfirmOpen, setActivationConfirmOpen] = useState(false)
  const [activationBusy, setActivationBusy] = useState(false)

  const [dialog, setDialog] = useState<DialogKind>(null)
  const [renewPlanKey, setRenewPlanKey] = useState("")
  const [adjustValidUpto, setAdjustValidUpto] = useState(toDateInputValue(tenant.validUpto))
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const loadProvisioning = useCallback(async () => {
    setProvisioningLoading(true)
    setProvisioningError(null)
    try {
      setProvisioning(await tenantsApi.getTenantProvisioningStatus(tenant.id))
    } catch (err) {
      setProvisioningError(errorMessage(err))
    } finally {
      setProvisioningLoading(false)
    }
  }, [tenant.id])

  useEffect(() => {
    void loadProvisioning()
  }, [loadProvisioning])

  const onRetryProvisioning = async () => {
    setRetrying(true)
    setProvisioningError(null)
    try {
      setProvisioning(await tenantsApi.retryTenantProvisioning(tenant.id))
    } catch (err) {
      setProvisioningError(errorMessage(err))
    } finally {
      setRetrying(false)
    }
  }

  const onToggleActivation = async () => {
    setActivationBusy(true)
    setActionError(null)
    try {
      await tenantsApi.changeTenantActivation(tenant.id, !tenant.isActive)
      setActivationConfirmOpen(false)
      onTenantChanged()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setActivationBusy(false)
    }
  }

  const openRenew = () => {
    setRenewPlanKey(tenant.plan ?? "")
    setDialogError(null)
    setDialog("renew")
  }

  const openAdjust = () => {
    setAdjustValidUpto(toDateInputValue(tenant.validUpto))
    setDialogError(null)
    setDialog("adjust")
  }

  const onSubmitDialog = async () => {
    setDialogError(null)
    setDialogBusy(true)
    try {
      if (dialog === "renew") {
        await tenantsApi.renewTenant(tenant.id, renewPlanKey.trim() || null)
      } else if (dialog === "adjust") {
        if (!adjustValidUpto) {
          setDialogError("Pick a date.")
          setDialogBusy(false)
          return
        }
        // "Valid until 31 Dec" means through the end of that day in Nepal, not 00:00 UTC (05:45 NPT) on it.
        await tenantsApi.adjustTenantValidity(tenant.id, nepalDayEndInclusiveUtc(adjustValidUpto))
      }
      setDialog(null)
      onTenantChanged()
    } catch (err) {
      setDialogError(errorMessage(err))
    } finally {
      setDialogBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="font-display text-base">Lifecycle</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openRenew}>
            <Play aria-hidden />
            Renew
          </Button>
          <Button variant="outline" size="sm" onClick={openAdjust}>
            <Clock aria-hidden />
            Adjust validity
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActionError(null)
              setActivationConfirmOpen(true)
            }}
          >
            {tenant.isActive ? (
              <>
                <Pause aria-hidden />
                Deactivate
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden />
                Activate
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError ? (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Provisioning</h4>
          {provisioningLoading && !provisioning ? (
            <SkeletonCard />
          ) : provisioningError && !provisioning ? (
            <ErrorState size="compact" title="Couldn't load provisioning status" message={provisioningError} onRetry={() => void loadProvisioning()} />
          ) : !provisioning ? (
            <p className="text-sm text-muted-foreground">No provisioning record for this tenant.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={provisioningVariant(provisioning.status)}>
                  {provisioning.status.toLowerCase().includes("fail") ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}
                  {provisioning.status}
                </Badge>
                {provisioning.currentStep ? <span className="text-sm text-muted-foreground">Step: {provisioning.currentStep}</span> : null}
                <Button variant="ghost" size="sm" onClick={() => void onRetryProvisioning()} loading={retrying} loadingText="Retrying…">
                  <RotateCw aria-hidden />
                  Retry
                </Button>
              </div>
              {provisioning.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{provisioning.error}</AlertDescription>
                </Alert>
              ) : null}
              {provisioning.steps.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {provisioning.steps.map((step, index) => (
                    <li key={`${step.step}-${index}`} className="flex items-center gap-2">
                      {step.status.toLowerCase().includes("fail") ? (
                        <XCircle className="h-4 w-4 text-destructive" aria-hidden />
                      ) : step.completedUtc ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                      )}
                      <span className="font-medium">{step.step}</span>
                      <span className="text-muted-foreground">— {step.status}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Started {formatDateTime(provisioning.startedUtc)} · Completed {formatDateTime(provisioning.completedUtc)}
              </p>
            </div>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        isOpen={activationConfirmOpen}
        onClose={() => setActivationConfirmOpen(false)}
        onConfirm={() => void onToggleActivation()}
        title={tenant.isActive ? "Deactivate this tenant?" : "Activate this tenant?"}
        description={
          tenant.isActive ? (
            <>
              <ShieldOff className="mr-1 inline h-4 w-4" aria-hidden />
              Deactivating blocks every user at this tenant from signing in until it's reactivated.
            </>
          ) : (
            "Activating restores sign-in access for this tenant's users."
          )
        }
        confirmText={tenant.isActive ? "Deactivate" : "Activate"}
        variant={tenant.isActive ? "destructive" : "default"}
        loading={activationBusy}
      />

      <Dialog open={dialog !== null} onOpenChange={(open) => (dialogBusy ? null : setDialog(open ? dialog : null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === "renew" ? "Renew subscription" : "Adjust validity"}</DialogTitle>
            <DialogDescription>
              {dialog === "renew"
                ? "Extends validity by one plan term and issues the term invoice. Leave the plan key blank to keep the current plan."
                : "Sets validity to an explicit date with no invoice or renewal event — for comps, support extensions, or immediate expiry."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {dialogError ? (
              <Alert variant="destructive">
                <AlertDescription>{dialogError}</AlertDescription>
              </Alert>
            ) : null}
            {dialog === "renew" ? (
              <div className="space-y-2">
                <Label htmlFor="renew-plan-key">New plan key (optional)</Label>
                <Input
                  id="renew-plan-key"
                  value={renewPlanKey}
                  onChange={(e) => setRenewPlanKey(e.target.value)}
                  placeholder={tenant.plan ?? "keep current plan"}
                  className="font-mono"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="adjust-valid-upto">Valid until</Label>
                <DatePicker id="adjust-valid-upto" value={adjustValidUpto} onChange={setAdjustValidUpto} allowFuture />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={dialogBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onSubmitDialog()} loading={dialogBusy} loadingText="Saving…">
              {dialog === "renew" ? "Renew" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
