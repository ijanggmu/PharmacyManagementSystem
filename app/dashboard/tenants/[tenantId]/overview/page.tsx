"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"

interface TenantOverviewResponse {
  tenant: {
    id: string
    name: string
    code: string
    country: string | null
    timezone: string | null
    currency: string | null
  }
  stats: {
    users: number
    medicines: number
    customers: number
    sales: number
    branches: number
  }
}

export default function TenantOverviewPage() {
  const params = useParams<{ tenantId: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [data, setData] = useState<TenantOverviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/superadmin/tenant-overview/${params.tenantId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error?.message || "Failed to load tenant overview")
        }
        const json = await res.json()
        setData(json.data)
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to load tenant overview.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [params.tenantId, toast])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Tenant Overview"
          description="Read-only overview of a tenant for superadmin."
        />

        <Section spacing="lg">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/tenants")}>
            Back to Tenants
          </Button>

          {isLoading ? (
            <LoadingState size="lg" text="Loading tenant overview..." />
          ) : !data ? (
            <div className="py-6 text-sm text-muted-foreground">
              No data available for this tenant.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>{data.tenant.name}</CardTitle>
                  <CardDescription>
                    Code: {data.tenant.code} • Country: {data.tenant.country || "N/A"} • Currency:{" "}
                    {data.tenant.currency || "N/A"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Timezone: {data.tenant.timezone || "N/A"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{data.stats.users}</div>
                  <p className="text-xs text-muted-foreground">Total users in this tenant</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Medicines</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{data.stats.medicines}</div>
                  <p className="text-xs text-muted-foreground">Tracked medicines</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Customers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{data.stats.customers}</div>
                  <p className="text-xs text-muted-foreground">Registered customers</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{data.stats.sales}</div>
                  <p className="text-xs text-muted-foreground">Sales records</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Branches</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{data.stats.branches}</div>
                  <p className="text-xs text-muted-foreground">Active branches</p>
                </CardContent>
              </Card>
            </div>
          )}
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}

