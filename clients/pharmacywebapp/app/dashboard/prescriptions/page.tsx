"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import PrescriptionTable from "@/features/prescriptions/components/prescription-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, CheckCircle2, CircleDashed, FileText, XCircle } from "lucide-react"
import { usePrescriptionStats } from "@/features/prescriptions/hooks/use-prescriptions"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { SkeletonTable } from "@/components/ui/skeleton"
import { PrescriptionRefillsDueCard } from "@/features/prescriptions/components/prescription-refills-due-card"

export default function PrescriptionsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [focusPrescriptionId, setFocusPrescriptionId] = useState<string | null>(null)

  // Get prescription stats
  const { data: statsResponse, isLoading: statsLoading } = usePrescriptionStats()
  const stats = statsResponse?.data?.[0] || {
    total: 0,
    pending: 0,
    filled: 0,
    partially_filled: 0,
    cancelled: 0
  }

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsLoading(false)
    }
    checkUser()
  }, [])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Prescriptions"
          description="Record prescriptions, track what has been dispensed, and follow up on refills."
          icon={FileText}
        />

        <Section spacing="lg">
          <StatGrid cols={5}>
            <StatCard
              label="Total"
              value={stats.total}
              hint="All prescriptions"
              icon={FileText}
              loading={isLoading || statsLoading}
            />
            <StatCard
              label="Pending"
              value={stats.pending}
              hint="Nothing dispensed yet"
              icon={Clock}
              tone={stats.pending > 0 ? "warning" : "default"}
              loading={isLoading || statsLoading}
            />
            <StatCard
              label="Partially filled"
              value={stats.partially_filled}
              hint="Some medicines still owed"
              icon={CircleDashed}
              tone={stats.partially_filled > 0 ? "info" : "default"}
              loading={isLoading || statsLoading}
            />
            <StatCard
              label="Filled"
              value={stats.filled}
              hint="Fully dispensed"
              icon={CheckCircle2}
              tone="success"
              loading={isLoading || statsLoading}
            />
            <StatCard
              label="Cancelled"
              value={stats.cancelled}
              hint="No longer valid"
              icon={XCircle}
              loading={isLoading || statsLoading}
            />
          </StatGrid>
        </Section>

        {isLoading ? (
          <Section spacing="lg">
            <SkeletonTable rows={6} cols={6} />
          </Section>
        ) : (
          <>
            <Section spacing="lg">
              <PrescriptionRefillsDueCard daysAhead={14} onOpenPrescription={setFocusPrescriptionId} />
            </Section>

            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>All prescriptions</CardTitle>
                  <CardDescription>
                    Compare prescribed and dispensed quantities at a glance. Open a row&apos;s menu to view items or
                    update its fill status.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PrescriptionTable
                    focusPrescriptionId={focusPrescriptionId}
                    onFocusHandled={() => setFocusPrescriptionId(null)}
                  />
                </CardContent>
              </Card>
            </Section>
          </>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
