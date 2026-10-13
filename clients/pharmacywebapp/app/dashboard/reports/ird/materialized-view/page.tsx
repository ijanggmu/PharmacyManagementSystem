"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer } from "@/components/layouts"
import { IrdBillRegister } from "@/features/accounting/components/ird-bill-register"

/** IRD materialized view of sales bills (GET /sales/reports/ird-bill-register). */
export default function IrdMaterializedViewPage() {
  return (
    <DashboardLayout>
      <PageContainer>
        <IrdBillRegister />
      </PageContainer>
    </DashboardLayout>
  )
}
