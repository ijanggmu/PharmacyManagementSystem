"use client"

import { useState } from "react"
import Link from "next/link"
import { FileText, ShieldAlert } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Button } from "@/components/ui/button"
import { EntityChangesTab } from "@/features/settings/components/system-logs/entity-changes-tab"
import { LogDetailSheet, type LogSelection } from "@/features/settings/components/system-logs/log-detail-sheet"

/**
 * Entity-level audit trail. Shares the table, paging (filters + page in one state, so applying a
 * filter can't fetch a stale page) and the details drawer (field-level old → new diff plus related
 * events by correlation id) with Settings → System logs → Entity changes.
 */
export default function AuditLogsPage() {
  const [selection, setSelection] = useState<LogSelection | null>(null)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Audit logs"
          description="Who changed what, and when — every create, update and delete in this pharmacy. Click a row for the field-level diff."
          icon={FileText}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/settings/system-logs?tab=requests">
                <ShieldAlert className="h-4 w-4" aria-hidden />
                System logs
              </Link>
            </Button>
          }
        />
        <Section spacing="lg">
          <EntityChangesTab onOpen={setSelection} hideReportLink />
        </Section>
        <LogDetailSheet selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
      </PageContainer>
    </DashboardLayout>
  )
}
