"use client"

import { useState } from "react"
import { EntityChangesTab } from "@/features/settings/components/system-logs/entity-changes-tab"
import { LogDetailSheet, type LogSelection } from "@/features/settings/components/system-logs/log-detail-sheet"

/**
 * This tenant's entity audit trail (who changed what) for the root support desk. Reads across the
 * tenant boundary via ?tenantId=, which the API gates on Permissions.AuditTrails.ViewCrossTenant.
 */
export function TenantAuditLog({ tenantId }: { tenantId: string }) {
  const [selection, setSelection] = useState<LogSelection | null>(null)
  return (
    <>
      <EntityChangesTab tenantId={tenantId} onOpen={setSelection} hideReportLink />
      <LogDetailSheet selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
    </>
  )
}
