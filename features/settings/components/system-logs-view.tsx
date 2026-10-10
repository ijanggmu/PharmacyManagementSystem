"use client"

import { useCallback, useState } from "react"
import { AlertTriangle, Building2, Database, Globe, KeyRound, Mail, Workflow } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiRequestsTab } from "./system-logs/api-requests-tab"
import { EmailSmsTab } from "./system-logs/email-tab"
import { EntityChangesTab } from "./system-logs/entity-changes-tab"
import { ErrorsTab } from "./system-logs/errors-tab"
import { IntegrationsTab } from "./system-logs/integrations-tab"
import { KpiStrip, type KpiTarget } from "./system-logs/kpi-strip"
import { LogDetailSheet, type LogSelection } from "./system-logs/log-detail-sheet"
import { SecurityTab } from "./system-logs/security-tab"
import { isSystemLogTab, SYSTEM_LOG_TABS, type SystemLogTab } from "./system-logs/tabs"


const TAB_META: Record<SystemLogTab, { label: string; icon: typeof Globe }> = {
  requests: { label: "API requests", icon: Globe },
  errors: { label: "Errors", icon: AlertTriangle },
  security: { label: "Access & security", icon: KeyRound },
  integrations: { label: "Integrations", icon: Workflow },
  entities: { label: "Audit log", icon: Database },
  email: { label: "Email / SMS", icon: Mail },
}

type Scope = "own" | "all" | "tenant"

export interface SystemLogsViewProps {
  initialTab?: SystemLogTab
  /** Root users holding Permissions.AuditTrails.ViewCrossTenant may look at other tenants. */
  canViewCrossTenant?: boolean
  /** Permissions.Sales.Ird.View — enables the IRD dispatch source under Integrations. */
  canViewIrd?: boolean
}

export default function SystemLogsView({ initialTab = "requests", canViewCrossTenant = false, canViewIrd = false }: SystemLogsViewProps) {
  const [tab, setTab] = useState<SystemLogTab>(initialTab)
  const [selection, setSelection] = useState<LogSelection | null>(null)
  const [scope, setScope] = useState<Scope>("own")
  const [tenantDraft, setTenantDraft] = useState("")
  const [tenantCommitted, setTenantCommitted] = useState("")

  const tenantId = !canViewCrossTenant ? undefined : scope === "all" ? "*" : scope === "tenant" && tenantCommitted ? tenantCommitted : undefined

  const changeTab = useCallback((value: string) => {
    if (!isSystemLogTab(value)) return
    setTab(value)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", value)
      window.history.replaceState(null, "", url.toString())
    } catch {
      // Deep-link sync is best effort.
    }
  }, [])

  const onNavigate = (target: KpiTarget) => changeTab(target)

  return (
    <div className="space-y-5">
      {canViewCrossTenant ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
          <Building2 className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-scope" className="text-xs text-muted-foreground">
              Tenant scope (platform admin)
            </Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger id="logs-scope" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="own">My tenant</SelectItem>
                <SelectItem value="all">All tenants</SelectItem>
                <SelectItem value="tenant">Specific tenant…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "tenant" ? (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                setTenantCommitted(tenantDraft.trim())
              }}
            >
              <Label htmlFor="logs-tenant" className="text-xs text-muted-foreground">
                Tenant id
              </Label>
              <Input
                id="logs-tenant"
                className="w-[200px] font-mono text-sm"
                placeholder="e.g. demo-pharmacy — Enter"
                value={tenantDraft}
                onChange={(e) => setTenantDraft(e.target.value)}
                onBlur={() => setTenantCommitted(tenantDraft.trim())}
              />
            </form>
          ) : null}
          <p className="text-xs text-muted-foreground sm:ml-auto">The audit log shows one tenant at a time — "All tenants" lists your own.</p>
        </div>
      ) : null}

      <KpiStrip tenantId={tenantId} onNavigate={onNavigate} />

      <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex w-max min-w-full justify-start lg:w-full">
            {SYSTEM_LOG_TABS.map((value) => {
              const { label, icon: Icon } = TAB_META[value]
              return (
                <TabsTrigger key={value} value={value} className="flex items-center gap-2 px-3">
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <TabsContent value="requests">
          <ApiRequestsTab tenantId={tenantId} onOpen={setSelection} />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTab tenantId={tenantId} onOpen={setSelection} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab tenantId={tenantId} onOpen={setSelection} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab tenantId={tenantId} canViewIrd={canViewIrd} onOpen={setSelection} />
        </TabsContent>
        <TabsContent value="entities">
          <EntityChangesTab onOpen={setSelection} tenantId={tenantId && tenantId !== "*" ? tenantId : undefined} />
        </TabsContent>
        <TabsContent value="email">
          <EmailSmsTab />
        </TabsContent>
      </Tabs>

      <LogDetailSheet selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
    </div>
  )
}
