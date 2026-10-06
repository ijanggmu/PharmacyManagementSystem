"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2, Activity } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"
import { getIrdQueueHealth } from "@/lib/api/ird-api"

interface SystemHealth {
  ird: {
    pendingCount: number
    failedCount: number
    salesFailedCount: number
    recentFailed: { id: string; last_error: string | null; created_at: string }[]
  }
}

export function SystemHealthMonitor() {
  const [data, setData] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setIsLoading(true)
        const ird = await getIrdQueueHealth()
        setData({ ird })
      } catch (error) {
        toast({
          title: "Failed to load system health",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchHealth()
  }, [toast])

  if (isLoading || !data) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Checking system health..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  const hasIrdIssues = data.ird.failedCount > 0 || data.ird.salesFailedCount > 0

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="System Health"
          description="Overview of IRD integration status and critical backend signals."
        />

        <Section spacing="lg">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  IRD Queue
                </CardTitle>
                {hasIrdIssues ? (
                  <Badge variant="destructive" className="text-xs">
                    Attention
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Healthy
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Pending invoices</span>
                  <span className="text-lg font-semibold">{data.ird.pendingCount}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Failed queue items</span>
                  <span className="text-lg font-semibold">{data.ird.failedCount}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Sales with IRD failure</span>
                  <span className="text-lg font-semibold">{data.ird.salesFailedCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {hasIrdIssues ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  Overall Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {hasIrdIssues
                    ? "Some IRD invoices or sales have failed. Review recent errors below and re-run your IRD worker after fixing configuration."
                    : "No critical IRD issues detected. Queue is processing normally."}
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Recent IRD Failures</CardTitle>
              <CardDescription>
                Up to 5 most recent failures from the IRD invoice queue, to help diagnose configuration or
                network issues.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.ird.recentFailed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent IRD failures.</p>
              ) : (
                <div className="space-y-3">
                  {data.ird.recentFailed.map((item) => (
                    <div key={item.id} className="border rounded-md p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.id.slice(0, 8)}…
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      <div className="text-xs">
                        {item.last_error || <span className="text-muted-foreground">No error message recorded.</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
