"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Boxes, Database, FileWarning, LayoutDashboard, Server, Workflow, type LucideIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSystemHealthData } from "../hooks/use-system-health-data"
import { buildAttentionItems } from "../lib/attention"
import { mergeModules } from "../lib/modules"
import { isPlatformCheck, overallStatus, summarizeChecks } from "../lib/status"
import { availableTabs, resolveTab, type HealthTab } from "../lib/tabs"
import { HealthHeader } from "./health-header"
import { IrdTab } from "./ird-tab"
import { JobsTab } from "./jobs-tab"
import { MigrationsTab } from "./migrations-tab"
import { ModulesTab } from "./modules-tab"
import { OverviewTab } from "./overview-tab"
import { ServicesTab } from "./services-tab"
import { TabCount } from "./status-ui"

export interface SystemHealthViewProps {
  /** Root support: Hangfire job stats and EF migration status (Permissions.Tenants.View). */
  canViewPlatform: boolean
  /** IRD submission queue (Permissions.Sales.Ird.View). */
  canViewIrd: boolean
  /** ?tab= from the server render, so the first paint already shows the right tab. */
  initialTab?: string
}

const TAB_META: Record<HealthTab, { label: string; icon: LucideIcon }> = {
  overview: { label: "Overview", icon: LayoutDashboard },
  modules: { label: "Modules", icon: Boxes },
  services: { label: "Services", icon: Server },
  jobs: { label: "Jobs", icon: Workflow },
  migrations: { label: "Migrations", icon: Database },
  ird: { label: "IRD queue", icon: FileWarning },
}

export function SystemHealthView({ canViewPlatform, canViewIrd, initialTab }: SystemHealthViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const tabs = useMemo(() => availableTabs({ canViewPlatform, canViewIrd }), [canViewPlatform, canViewIrd])
  const [tab, setTabState] = useState<HealthTab>(() => resolveTab(initialTab, tabs))

  const setTab = useCallback(
    (next: string) => {
      const resolved = resolveTab(next, tabs)
      setTabState(resolved)
      const params = new URLSearchParams(window.location.search)
      if (resolved === "overview") params.delete("tab")
      else params.set("tab", resolved)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [tabs, router, pathname],
  )

  const h = useSystemHealthData({ canViewPlatform, canViewIrd })
  const { readiness, jobs, migrations, ird } = h

  const snapshot = h.readinessFailed ? undefined : readiness.data
  const overall = overallStatus(snapshot, { loading: readiness.isLoading, failed: h.readinessFailed })
  const checks = useMemo(() => readiness.data?.result?.results ?? [], [readiness.data])
  const summary = useMemo(() => summarizeChecks(checks), [checks])
  const moduleRows = useMemo(
    () => mergeModules(checks, canViewPlatform ? migrations.data?.contexts : undefined),
    [checks, canViewPlatform, migrations.data],
  )
  const platformChecks = checks.filter((c) => isPlatformCheck(c.name))

  const readinessError = readiness.error?.message ?? null
  const attention = useMemo(
    () =>
      buildAttentionItems({
        readiness: { snapshot: h.readinessFailed ? undefined : readiness.data, error: h.readinessFailed ? readinessError : null },
        jobs: canViewPlatform ? jobs.data : undefined,
        migrations: canViewPlatform ? migrations.data : undefined,
        ird: canViewIrd ? ird.data : undefined,
      }),
    [readiness.data, h.readinessFailed, readinessError, jobs.data, migrations.data, ird.data, canViewPlatform, canViewIrd],
  )
  const attentionPartial =
    readiness.isLoading || (canViewPlatform && (jobs.isLoading || migrations.isLoading)) || (canViewIrd && ird.isLoading)

  const pendingMigrations = migrations.data?.contexts.reduce((n, c) => n + c.pendingMigrations.length, 0)
  const migrationIssues = migrations.data?.contexts.filter((c) => c.error || c.hasPendingMigrations || c.pendingMigrations.length > 0).length ?? 0
  const moduleIssues = moduleRows.filter((r) => r.hasIssue).length
  const platformDown = platformChecks.filter((c) => c.status !== "Healthy").length
  const failedJobs = jobs.data?.statistics?.failed ?? 0
  const irdIssues = (ird.data?.failedCount ?? 0) + (ird.data?.salesFailedCount ?? 0)

  const badges: Record<HealthTab, ReactNode> = {
    overview: attention.length ? (
      <TabCount value={attention.length} tone={attention.some((a) => a.severity === "critical") ? "danger" : "warning"} label={`${attention.length} items need attention`} />
    ) : readiness.data ? (
      <TabCount value="OK" tone="success" label="Nothing needs attention" />
    ) : null,
    modules: moduleRows.length ? (
      moduleIssues ? (
        <TabCount value={`${moduleIssues}/${moduleRows.length}`} tone="warning" label={`${moduleIssues} of ${moduleRows.length} modules with issues`} />
      ) : (
        <TabCount value={moduleRows.length} label={`${moduleRows.length} modules, all healthy`} />
      )
    ) : null,
    services: platformChecks.length ? (
      platformDown ? (
        <TabCount value={`${platformDown} down`} tone="danger" label={`${platformDown} platform services not healthy`} />
      ) : (
        <TabCount value={platformChecks.length} label={`${platformChecks.length} services, all healthy`} />
      )
    ) : null,
    jobs: jobs.data ? (
      failedJobs ? (
        <TabCount value={`${failedJobs.toLocaleString()} failed`} tone="danger" label={`${failedJobs} failed jobs`} />
      ) : (
        <TabCount value={jobs.data.recurringJobs.length} label={`${jobs.data.recurringJobs.length} recurring jobs`} />
      )
    ) : null,
    migrations: migrations.data ? (
      migrationIssues ? (
        <TabCount value={`${migrationIssues} pending`} tone="warning" label={`${migrationIssues} modules with pending or failed migrations`} />
      ) : (
        <TabCount value="OK" tone="success" label="All migrations applied" />
      )
    ) : null,
    ird: ird.data ? (
      irdIssues ? (
        <TabCount value={`${irdIssues} failed`} tone="warning" label={`${irdIssues} IRD failures`} />
      ) : (
        <TabCount value={ird.data.pendingCount} label={`${ird.data.pendingCount} invoices pending`} />
      )
    ) : null,
  }

  const retryReadiness = () => void readiness.refetch()

  return (
    <div className="space-y-5">
      <HealthHeader
        overall={overall}
        checkedAt={Math.max(readiness.dataUpdatedAt, readiness.errorUpdatedAt)}
        live={h.live}
        visible={h.visible}
        onToggleLive={() => h.setLive((v) => !v)}
        onRefresh={h.refreshAll}
        fetching={h.fetching}
        history={h.history}
        message={h.readinessFailed ? readinessError : (snapshot?.error ?? null)}
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="max-w-full overflow-x-auto rounded-lg">
          <TabsList className="h-auto min-w-max p-1" aria-label="System health sections">
            {tabs.map((t) => {
              const Icon = TAB_META[t].icon
              return (
                <TabsTrigger key={t} value={t} className="h-10 flex-none px-3 sm:h-8">
                  <Icon aria-hidden />
                  {TAB_META[t].label}
                  {badges[t]}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <TabsContent value="overview" className="animate-fade-in motion-reduce:animate-none">
          <OverviewTab
            summary={summary}
            roundTripMs={snapshot && snapshot.httpStatus !== 0 ? snapshot.roundTripMs : null}
            readinessLoading={readiness.isLoading}
            failedJobs={jobs.data?.statistics?.failed}
            pendingMigrations={pendingMigrations}
            jobsLoading={jobs.isLoading}
            migrationsLoading={migrations.isLoading}
            canViewPlatform={canViewPlatform}
            attention={attention}
            attentionPartial={attentionPartial}
            onNavigate={setTab}
          />
        </TabsContent>

        <TabsContent value="modules" className="animate-fade-in motion-reduce:animate-none">
          <ModulesTab
            rows={moduleRows}
            loading={readiness.isLoading || (canViewPlatform && migrations.isLoading)}
            error={readiness.error}
            onRetry={retryReadiness}
            showMigrations={canViewPlatform}
            migrationsError={migrations.error}
          />
        </TabsContent>

        <TabsContent value="services" className="animate-fade-in motion-reduce:animate-none">
          <ServicesTab checks={checks} loading={readiness.isLoading} error={readiness.error} onRetry={retryReadiness} />
        </TabsContent>

        {canViewPlatform && (
          <TabsContent value="jobs" className="animate-fade-in motion-reduce:animate-none">
            <JobsTab data={jobs.data} loading={jobs.isLoading} error={jobs.error} onRetry={() => void jobs.refetch()} />
          </TabsContent>
        )}

        {canViewPlatform && (
          <TabsContent value="migrations" className="animate-fade-in motion-reduce:animate-none">
            <MigrationsTab data={migrations.data} loading={migrations.isLoading} error={migrations.error} onRetry={() => void migrations.refetch()} />
          </TabsContent>
        )}

        {canViewIrd && (
          <TabsContent value="ird" className="animate-fade-in motion-reduce:animate-none">
            <IrdTab data={ird.data} loading={ird.isLoading} error={ird.error} onRetry={() => void ird.refetch()} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
