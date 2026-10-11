"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { Activity, CreditCard, Database, History, Layers, Users } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonCard } from "@/components/ui/skeleton"
import { TenantStatusBadge } from "@/features/tenants/components/tenant-management"
import { TenantBilling } from "@/features/tenants/components/tenant-billing"
import { TenantLifecycle } from "@/features/tenants/components/tenant-lifecycle"
import { tenantsApi } from "@/features/tenants/api-client"
import { TenantUsers } from "@/features/tenants/components/tenant-users"
import { TenantAuditLog } from "@/features/tenants/components/tenant-audit-log"
import type { TenantStatus } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { useTabParam } from "@/features/tenants/hooks/use-tab-param"

const TABS = ["lifecycle", "billing", "users", "audit"] as const

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  )
}

export function TenantDetail({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<TenantStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const [tab, setTab] = useTabParam(TABS)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTenant(await tenantsApi.getTenantStatus(tenantId))
      setError(null)
    } catch (err) {
      setError(err instanceof DotnetApiError ? err.normalized.message : "Could not load this tenant.")
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !tenant) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span className="sr-only">Loading tenant</span>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <Card>
        <ErrorState
          title={error ? "Couldn't load this tenant" : "Tenant not found"}
          message={error ?? "No tenant exists with this ID. It may have been removed."}
          action={{ label: "Back to tenants", onClick: () => router.push("/dashboard/tenants") }}
        />
      </Card>
    )
  }

  const expiry = tenant.expiryState.toLowerCase()
  const expiryVariant: "success" | "warning" | "danger" | "muted" = /active|valid|ok|none/.test(expiry)
    ? "success"
    : /grace|soon|warning/.test(expiry)
      ? "warning"
      : /expired|lapsed|suspend/.test(expiry)
        ? "danger"
        : "muted"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="font-display text-lg">{tenant.name}</CardTitle>
            <CardDescription className="font-mono">{tenant.id}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <TenantStatusBadge isActive={tenant.isActive} validUpto={tenant.validUpto} />
            <Badge variant="info">
              <Layers aria-hidden />
              {tenant.plan ?? "Default"} plan
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Expiry state" value={<Badge variant={expiryVariant}>{tenant.expiryState}</Badge>} />
            <Field label="Valid until" value={<span className="num">{new Date(tenant.validUpto).toLocaleDateString()}</span>} />
            <Field
              label="Grace period ends"
              value={
                <span className="num">
                  {Number.isNaN(new Date(tenant.graceEndsUtc).getTime()) ? "—" : new Date(tenant.graceEndsUtc).toLocaleDateString()}
                </span>
              }
            />
            <Field label="Admin email" value={tenant.adminEmail} />
            <Field label="Issuer" value={tenant.issuer ?? "—"} />
            <Field
              label="Provisioning"
              value={
                tenant.hasConnectionString ? (
                  <Badge variant="success">
                    <Database aria-hidden />
                    Dedicated database
                  </Badge>
                ) : (
                  <Badge variant="muted">
                    <Database aria-hidden />
                    Shared database
                  </Badge>
                )
              }
            />
          </dl>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="lifecycle">
            <Activity aria-hidden />
            Lifecycle
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard aria-hidden />
            Billing
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users aria-hidden />
            Users
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History aria-hidden />
            Audit log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lifecycle" className="mt-4">
          <TenantLifecycle tenant={tenant} onTenantChanged={() => void load()} />
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <TenantBilling tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <TenantUsers tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <TenantAuditLog tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
